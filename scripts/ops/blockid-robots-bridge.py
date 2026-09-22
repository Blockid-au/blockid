#!/usr/bin/env python3
"""Pinned temporary canonical robots bridge. Default prepares an offline plan only."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import time

SHA='23cc80693a9476e63d011d7ca0e6e88da76471e2'
RELEASE=Path('/data/releases/OYwvAM82CjG5RiQunpcNc')
BODY=RELEASE/'.next/server/app/robots.txt.body'
BODY_SHA='60eac6a58ff88948161579d2d0244f85a23bf36a1821af5809e0345a8f1c9466'
DEST=Path('/data/blockid-discovery')/SHA/'robots.txt'
CONFIG=Path('/etc/nginx/sites-available/blockid-live')
MAIN=Path('/etc/nginx/nginx.conf')
LOCK=Path('/tmp/blockid-deploy.lock')
ALLOW=['/','/tbr/demo$','/tbr/demo?','/tbr/demo/','/score','/startup-index','/solutions/','/business-id','/id/','/insights','/insights/','/sample-business-report','/funding/grants','/funding/programs']
DISALLOW=['/api/','/workspace/','/tbr/','/vi/tbr/','/es/tbr/','/ja/tbr/','/vi/workspace/','/es/workspace/','/ja/workspace/','/dashboard','/dashboard/','/checkout','/checkout/','/admin','/admin/','/apply/']

def digest(data):return hashlib.sha256(data).hexdigest()
def validate_body(data):
 expected='User-Agent: *\n'+''.join('Allow: '+p+'\n' for p in ALLOW)+''.join('Disallow: '+p+'\n' for p in DISALLOW)+'\nSitemap: https://blockid.au/sitemap.xml\n'
 if data!=expected.encode() or digest(data)!=BODY_SHA:raise ValueError('compiled canonical robots mismatch')
 return data

def transform(text):
 needle='server_name blockid.au www.blockid.au;'
 if text.count(needle)!=1:raise ValueError('ambiguous BlockID server')
 pos=text.index(needle);start=text.rfind('\nserver {',0,pos)
 if start<0:raise ValueError('unknown nginx layout')
 depth=0;end=None
 for i in range(text.index('{',start),len(text)):
  if text[i]=='{':depth+=1
  elif text[i]=='}':
   depth-=1
   if depth==0:end=i+1;break
 if end is None:raise ValueError('unclosed server')
 block=text[start:end]
 if 'robots' in block or '\n    include ' in block:raise ValueError('existing robots/include requires explicit review')
 insert=block.index(needle)+len(needle)
 addition=f'''
    # TEMP G30 canonical robots bridge; remove after next origin route verification.
    location = /robots.txt {{
        alias {DEST};
        default_type text/plain;
        charset utf-8;
        autoindex off;
        disable_symlinks on;
        add_header Cache-Control "no-cache" always;
        limit_except GET HEAD {{ deny all; }}
    }}
'''
 return text[:start]+block[:insert]+addition+block[insert:]+text[end:]

def staged_main(original,site):
 needle='include /etc/nginx/sites-enabled/*;'
 if original.count(needle)!=1:raise ValueError('unknown main nginx includes')
 found=0;lines=[]
 for path in sorted(Path('/etc/nginx/sites-enabled').iterdir()):
  if path.resolve()==CONFIG:found+=1;lines.append(f'include {site};')
  else:lines.append(f'include {path};')
 if found!=1:raise ValueError('shared nginx site include ambiguous')
 return original.replace(needle,'\n'.join(lines))

def command(*args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
def install(content,temporary):
 site=temporary/'site.conf';site.write_text(content);site.chmod(0o600)
 main=temporary/'nginx.conf';main.write_text(staged_main(MAIN.read_text(),site));main.chmod(0o600)
 command('sudo','-n','nginx','-t','-c',str(main))
 target=CONFIG.with_name('.blockid-live.robots-bridge')
 command('sudo','-n','install','-o','root','-g','root','-m','0644',str(site),str(target))
 command('sudo','-n','mv','-T',str(target),str(CONFIG))
 command('sudo','-n','nginx','-t');command('sudo','-n','nginx','-s','reload')

def verify_delivery():
 urls=['http://127.0.0.1/robots.txt','https://blockid.au/robots.txt','https://www.blockid.au/robots.txt']
 for url in urls:
  for attempt in range(3):
   args=['curl','--fail','--silent','--show-error','--noproxy','*','--connect-timeout','3','--max-time','10','--location','--max-redirs','2','--header','Cache-Control: no-cache']
   if url.startswith('http://127.0.0.1'):args+=['--header','Host: blockid.au','--header','X-Forwarded-Proto: https']
   result=subprocess.run(args+[url+'?g30_robots='+str(time.time_ns())],capture_output=True,timeout=13)
   if result.returncode==0 and digest(result.stdout)==BODY_SHA:break
   if attempt==2:raise ValueError('canonical robots delivery verification failed')
   time.sleep(1)

def transition(before,after,read,apply,verify):
 if read()!=before:raise ValueError('nginx changed before install')
 try:
  apply(after);verify()
 except BaseException:
  if read() not in [before,after]:raise RuntimeError('external config edit; explicit recovery required')
  apply(before)
  raise

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--output',type=Path,required=True,help='new private plan directory under /tmp')
 parser.add_argument('--apply',action='store_true')
 parser.add_argument('--expected-nginx-sha',help='reviewed original config hash; required for apply')
 args=parser.parse_args()
 if args.output.parent!=Path('/tmp') or args.output.exists() or args.output.is_symlink():raise ValueError('new direct /tmp plan directory required')
 info=BODY.lstat()
 if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or BODY.resolve()!=BODY:raise ValueError('unaliased compiled body required')
 data=validate_body(BODY.read_bytes());manifest=json.loads((RELEASE/'.deploy-manifest.json').read_text())
 if (manifest.get('build_sha') or manifest.get('git_sha'))!=SHA:raise ValueError('compiled release SHA mismatch')
 lock=os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW)
 try:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  before=CONFIG.read_text();after=transform(before);config_hash=digest(before.encode())
  if args.apply and args.expected_nginx_sha!=config_hash:raise ValueError('reviewed nginx hash changed')
  args.output.mkdir(mode=0o700)
  for name,content in [('robots.txt',data),('nginx.before',before.encode()),('nginx.after',after.encode())]:
   fd=os.open(args.output/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   with os.fdopen(fd,'wb') as file:file.write(content)
  evidence={'compiledSha':SHA,'bodySha256':BODY_SHA,'bodyBytes':len(data),'nginxBeforeSha256':config_hash,'destination':str(DEST),'prepared':str(args.output),'applied':False}
  if args.apply:
   # Verify current release/PID/listener/health under the same deploy lock.
   web=Path('/home/dovanlong/blockid.au/web');spec=importlib.util.spec_from_file_location('serving',web/'scripts/g30-serving-state.py');serving=importlib.util.module_from_spec(spec);spec.loader.exec_module(serving)
   state=serving.read_state(web)
   if state['phase']!='stable' or state['active']['port']!=4107 or state['active']['sha']!=SHA:raise ValueError('active origin changed')
   serving.verify_entry(state['active'],web)
   parent=DEST.parent.parent
   if parent.exists() and (parent.resolve()!=parent or parent.stat().st_uid!=os.getuid()):raise ValueError('discovery root ownership/alias mismatch')
   parent.mkdir(mode=0o755,exist_ok=True);DEST.parent.mkdir(mode=0o755,exist_ok=False)
   fd=os.open(DEST,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o444)
   with os.fdopen(fd,'wb') as file:file.write(data);file.flush();os.fsync(file.fileno())
   DEST.chmod(0o444);DEST.parent.chmod(0o555)
   with tempfile.TemporaryDirectory(prefix='robots-nginx-',dir=args.output) as temp:
    def verify():
     verify_delivery();serving.verify_entry(state['active'],web)
    transition(before,after,CONFIG.read_text,lambda content:install(content,Path(temp)),verify)
   evidence['applied']=True
  (args.output/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n');(args.output/'evidence.json').chmod(0o600)
  print(json.dumps(evidence))
 finally:os.close(lock)

if __name__=='__main__':main()
