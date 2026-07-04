import math, os, subprocess, json
from PIL import Image

TILE=256
OUT_DIR='/home/user/yeulmaru-promo/image'
CACHE='/tmp/osm_tiles'
os.makedirs(CACHE, exist_ok=True)

def lng2xt(lng,z): return (lng+180.0)/360.0*(2**z)
def lat2yt(lat,z):
    r=math.radians(lat)
    return (1.0-math.asinh(math.tan(r))/math.pi)/2.0*(2**z)

def fetch_tile(z,x,y):
    p=os.path.join(CACHE,f"{z}_{x}_{y}.png")
    if os.path.exists(p) and os.path.getsize(p)>500: return p
    url=f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    subprocess.run(['curl','-s','-o',p,'-H','User-Agent: yeulmaru-promo/1.0 (internal map)',url],check=True)
    return p

# region: (target bounds W,S,E,N), zoom, out filename
REGIONS={
 'all':   (127.42,34.70,127.78,35.01, 11, 'promomap-all.jpg'),
 'yeosu': (127.585,34.715,127.745,34.795, 13, 'promomap-yeosu.jpg'),
 'suncheon':(127.42,34.905,127.565,34.995, 13,'promomap-suncheon.jpg'),
 'gwangyang':(127.63,34.895,127.775,34.985, 13,'promomap-gwangyang.jpg'),
}

meta={}
for key,(W,S,E,N,z,fn) in REGIONS.items():
    x0=math.floor(lng2xt(W,z)); x1=math.floor(lng2xt(E,z))
    y0=math.floor(lat2yt(N,z)); y1=math.floor(lat2yt(S,z))  # N is smaller y
    nx=x1-x0+1; ny=y1-y0+1
    canvas=Image.new('RGB',(nx*TILE,ny*TILE),(233,233,238))
    for xi in range(nx):
        for yi in range(ny):
            tp=fetch_tile(z,x0+xi,y0+yi)
            try:
                t=Image.open(tp).convert('RGB')
                canvas.paste(t,(xi*TILE,yi*TILE))
            except Exception as ex:
                print('  tile fail',z,x0+xi,y0+yi,ex)
    # 살짝 밝기 낮춰 마커 대비 확보(브랜드 톤과 조화) — 옅게만
    canvas.save(os.path.join(OUT_DIR,fn),'JPEG',quality=82,optimize=True)
    meta[key]={'z':z,'x0':x0,'y0':y0,'nx':nx,'ny':ny,'file':'image/'+fn,
               'w':nx*TILE,'h':ny*TILE}
    print(f"{key}: {fn} {nx}x{ny} tiles = {nx*TILE}x{ny*TILE}px  z{z} x0{x0} y0{y0}  {os.path.getsize(os.path.join(OUT_DIR,fn))//1024}KB")

print('\nJSMETA='+json.dumps(meta,ensure_ascii=False))
