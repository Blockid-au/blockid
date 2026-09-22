#!/usr/bin/env python3
"""Explicit post-promotion stage disposition; never removes release/transition state."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import tempfile
import time

IDENTITY=('sha','port','pid','startTicks','releasePath','schemaDigest')
def sha(raw):return hashlib.sha256(raw).hexdigest()
def identity(entry):return {k:entry[k] for k in IDENTITY}
def sync(directory):
 fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def signature(info):return (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns)
def read_file(path,private=False):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_nlink!=1 or before.st_size>4_194_304:raise ValueError('unsafe disposition file')
  if private and stat.S_IMODE(before.st_mode)!=0o600:raise ValueError('archive must be private')
  chunks=[]
  while True:
   chunk=os.read(fd,65536)
   if not chunk:break
   chunks.append(chunk)
  raw=b''.join(chunks)
  if signature(before)!=signature(os.fstat(fd)) or signature(before)!=signature(path.lstat()):raise ValueError('file changed while reading')
  return raw,signature(before)
 finally:os.close(fd)
def private_dir(path):
 try:path.mkdir(mode=0o700)
 except FileExistsError:pass
 info=path.lstat()
 if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o700 or info.st_uid!=os.getuid():raise ValueError('unsafe archive directory')
 return path

def archive_root(control):
 base=Path(pwd.getpwuid(os.getuid()).pw_dir)/'.local/state/blockid-runtime'
 # Existing supervisor-owned root only; do not create or follow alternate roots.
 info=base.lstat()
 if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o700 or info.st_uid!=os.getuid() or base.resolve()!=base or base.is_relative_to(control):raise ValueError('unsafe private runtime root')
 return private_dir(base/'receipt-stage-dispositions')

def publish_new(path,raw):
 """Durable no-replace publication; a crash never exposes partial archive bytes."""
 fd,temp=tempfile.mkstemp(prefix='.disposition-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as out:out.write(raw);out.flush();os.fsync(out.fileno())
  # Linux renameat2(RENAME_NOREPLACE): atomic publication without a second
  # hard link that could survive a crash and invalidate single-link checks.
  libc=ctypes.CDLL(None,use_errno=True)
  rename=libc.renameat2;rename.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint];rename.restype=ctypes.c_int
  if rename(-100,os.fsencode(temp),-100,os.fsencode(path),1)!=0:
   number=ctypes.get_errno();raise OSError(number,os.strerror(number))
  sync(path.parent)
 finally:
  if os.path.exists(temp):os.unlink(temp)

def live_proof(record,control,state,expansion):
 if record.get('phase')!='inspected' or record.get('controlWeb')!=str(control):raise ValueError('exact inspected canonical stage required')
 candidate=record.get('candidate')
 if not isinstance(candidate,dict) or record.get('sourceSha')!=candidate.get('sha'):raise ValueError('candidate source mismatch')
 state.validate_entry(candidate,control)
 serving=state.read_state(control);transition=expansion.read(control)
 if not serving or serving.get('phase')!='stable' or not transition or transition.get('phase')!='sealed':raise ValueError('stable sealed promotion required')
 active=serving.get('active');warm=serving.get('previous')
 if not active or not warm or identity(active)!=identity(candidate) or active['port']==warm['port'] or active['pid']==warm['pid']:raise ValueError('candidate must be current with distinct warm rollback')
 for entry in [active,warm]:
  matches=[e for e in serving.get('retained',[]) if identity(e)==identity(entry)]
  if len(matches)!=1 or entry['port'] not in serving.get('verifiedGood',[]) or entry['port'] in serving.get('quarantined',[]):raise ValueError('current and warm must be retained verified good')
  state.verify_entry(entry,control)
 sealed=transition.get('releases',{}).get('candidate')
 if not sealed or identity(sealed)!=identity(candidate):raise ValueError('sealed candidate identity differs')
 if not expansion.allowed(control,active,warm,serving) or not expansion.allowed(control,warm,active,serving):raise ValueError('actual sealed warm edge refused')
 return {'candidate':identity(candidate),'warm':identity(warm),'transitionSha256':sha(json.dumps(transition,sort_keys=True,separators=(',',':')).encode())}

def dispose(control,expected,state,expansion,lock_fd):
 state.proxy.require_lock(lock_fd)
 if not isinstance(expected,str) or not re.fullmatch('[0-9a-f]{64}',expected):raise ValueError('explicit stage SHA256 required')
 control=control.resolve(strict=True);location=control/'content/reports/g30-receipt-candidate.json'
 if location.parent.resolve(strict=True)!=location.parent:raise ValueError('stage directory cannot be aliased')
 if location.is_symlink():raise ValueError('stage cannot be symlink')
 root=archive_root(control);folder=root/expected
 archived=folder/'stage.json';audit=folder/'audit.json';completed=folder/'completed.json'
 present=location.exists()
 if present:
  raw,original=read_file(location)
  if sha(raw)!=expected:raise ValueError('stage hash differs from explicit intent')
 else:
  # Never treat absence alone as successful disposition.
  if not folder.exists() or not audit.exists():raise ValueError('missing stage without prior audit')
  private_dir(folder);raw,_=read_file(archived,True);original=None
  if sha(raw)!=expected:raise ValueError('prior archive hash mismatch')
 record=json.loads(raw);proof=live_proof(record,control,state,expansion)
 fixed={'version':1,'stageSha256':expected,'canonicalStage':str(location),'controlWeb':str(control),**proof}
 private_dir(folder)
 if archived.exists() or archived.is_symlink():
  saved,_=read_file(archived,True)
  if saved!=raw:raise ValueError('conflicting immutable stage archive')
 else:publish_new(archived,raw)
 if audit.exists() or audit.is_symlink():
  prior=json.loads(read_file(audit,True)[0])
  if any(prior.get(k)!=v for k,v in fixed.items()) or prior.get('state')!='prepared':raise ValueError('prior audit differs')
 else:publish_new(audit,json.dumps({**fixed,'state':'prepared','preparedAt':int(time.time())},sort_keys=True).encode())
 if completed.exists() or completed.is_symlink():
  prior=json.loads(read_file(completed,True)[0])
  required={**fixed,'state':'disposed','archivePath':str(archived),'transitionAndArtifactsPreserved':True}
  if any(prior.get(k)!=v for k,v in required.items()):raise ValueError('completion receipt differs')
 if read_file(archived,True)[0]!=raw:raise ValueError('archive verification failed')
 if live_proof(record,control,state,expansion)!=proof:raise ValueError('live state changed before disposition')
 if present:
  current,current_signature=read_file(location)
  if current_signature!=original or current!=raw:raise ValueError('stage changed before unlink')
  # Shared canonical lock serializes compliant writers; no marker is inferred.
  location.unlink();sync(location.parent)
 elif location.exists() or location.is_symlink():raise ValueError('new stage appeared during recovery')
 result={**fixed,'state':'disposed','archivePath':str(archived),'transitionAndArtifactsPreserved':True,'completedAt':int(time.time())}
 if completed.exists() or completed.is_symlink():
  prior=json.loads(read_file(completed,True)[0])
  if any(prior.get(k)!=v for k,v in result.items() if k!='completedAt'):raise ValueError('completion receipt differs')
  result=prior
 else:publish_new(completed,json.dumps(result,sort_keys=True).encode())
 return result
