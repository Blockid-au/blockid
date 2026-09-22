#!/usr/bin/env python3
"""Real Redis atomic cases in disposable --network none container; never host Redis or secrets."""
import concurrent.futures, datetime, pathlib, re, subprocess, time, uuid
source = (pathlib.Path(__file__).resolve().parents[3] / 'src/lib/ai/free-quota.ts').read_text()
reserve = re.search(r'RESERVE_FREE_QUOTA_LUA = `\n(.*?)\n`;', source, re.S).group(1)
block = re.search(r'BLOCK_FREE_QUOTA_LUA = `\n(.*?)\n`;', source, re.S).group(1)
name = 'g30-free-quota-test-' + uuid.uuid4().hex[:12]
def shell(*args): return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()
def cli(*args): return shell('docker','exec',name,'redis-cli','--raw',*map(str,args)).splitlines()
def attempt(account, operation, remaining=50):
    now = int(time.time()*1000)
    day = datetime.datetime.now(datetime.timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)
    end = int((day+datetime.timedelta(days=1)).timestamp()*1000)
    return cli('EVAL',reserve,4,account+':day',account+':minute',account+':op:'+operation,account+':blocked',now,remaining,end,operation)
try:
    shell('docker','run','-d','--rm','--name',name,'--network','none','--memory','64m','--tmpfs','/data:rw,size=16m','redis:7-alpine','redis-server','--save','','--appendonly','no')
    for _ in range(30):
        try:
            if cli('PING') == ['PONG']: break
        except subprocess.CalledProcessError: pass
        time.sleep(.1)
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results=list(pool.map(lambda i:attempt('minute',str(i)),range(25)))
    assert sum(r[0]=='reserved' for r in results)==18,results
    assert cli('GET','minute:day')==['32']
    print('PASS concurrent minute cap / one atomic daily decrement per grant')
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results=list(pool.map(lambda _:attempt('duplicate','same'),range(10)))
    assert sum(r[0]=='reserved' for r in results)==1,results
    assert cli('GET','duplicate:day')==['49']
    print('PASS duplicate operation does not grant twice')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda i:attempt('daily',str(i),6),range(8)))
    assert sum(r[0]=='reserved' for r in results)==1,results
    assert attempt('daily','new',50)==['denied','daily_headroom']
    print('PASS daily headroom / stale larger observation cannot refill spent slots')
    first=int(cli('EVAL',block,1,'blocked:blocked',120000)[0])
    second=int(cli('EVAL',block,1,'blocked:blocked',1000)[0])
    assert second>=first
    assert attempt('blocked','one')==['denied','provider_backoff']
    assert attempt('other-account','one')[0]=='reserved'
    print('PASS persistent monotone backoff / account isolation')
finally:
    subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
