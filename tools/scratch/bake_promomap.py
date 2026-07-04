import math, os, subprocess, json
from PIL import Image
TILE=256; OUT='/home/user/yeulmaru-promo/image'; CACHE='/tmp/carto_tiles'
os.makedirs(CACHE,exist_ok=True)
STYLE='light_nolabels'  # 라벨·지형 없음 = 해안선/도로선/행정경계만
def lng2xt(l,z): return (l+180.0)/360.0*(2**z)
def lat2yt(l,z):
    r=math.radians(l); return (1.0-math.asinh(math.tan(r))/math.pi)/2.0*(2**z)
def fetch(z,x,y):
    p=os.path.join(CACHE,f"{z}_{x}_{y}.png")
    if os.path.exists(p) and os.path.getsize(p)>300: return p
    subprocess.run(['curl','-s','-o',p,'-H','User-Agent: yeulmaru-promo/1.0 (internal)',f"https://basemaps.cartocdn.com/{STYLE}/{z}/{x}/{y}.png"],check=True)
    return p
REGIONS={
 'all':      (127.33,34.70,127.80,35.01,11,'promomap-all.jpg'),
 'yeosu':    (127.585,34.715,127.745,34.795,13,'promomap-yeosu.jpg'),
 'suncheon': (127.42,34.905,127.565,34.995,13,'promomap-suncheon.jpg'),
 'gwangyang':(127.63,34.895,127.775,34.985,13,'promomap-gwangyang.jpg'),
}
for key,(W,S,E,N,z,fn) in REGIONS.items():
    x0=math.floor(lng2xt(W,z)); x1=math.floor(lng2xt(E,z))
    y0=math.floor(lat2yt(N,z)); y1=math.floor(lat2yt(S,z))
    nx=x1-x0+1; ny=y1-y0+1
    c=Image.new('RGB',(nx*TILE,ny*TILE),(240,240,244))
    for xi in range(nx):
        for yi in range(ny):
            c.paste(Image.open(fetch(z,x0+xi,y0+yi)).convert('RGB'),(xi*TILE,yi*TILE))
    c.save(os.path.join(OUT,fn),'JPEG',quality=84,optimize=True)
    print(f"{key}: {fn} {nx}x{ny}={nx*TILE}x{ny*TILE} z{z} {os.path.getsize(os.path.join(OUT,fn))//1024}KB")
