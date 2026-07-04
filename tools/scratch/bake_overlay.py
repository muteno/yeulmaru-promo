import math, os, json, subprocess, time
from PIL import Image, ImageDraw

OUT='/home/user/yeulmaru-promo/image'; SS=2
ACCENT=(74,77,231)  # --accent #4A4DE7
HJD='/tmp/hjd.geojson'
UA='yeulmaru-promo/1.0 (map overlay; ems1130g@gmail.com)'

MAPS={
 'all':      {'z':11,'x0':1748,'y0':811,'nx':4,'ny':3,'cities':['여수','순천','광양'],'major_only':True},
 'yeosu':    {'z':13,'x0':6999,'y0':3250,'nx':4,'ny':3,'cities':['여수'],'major_only':False},
 'suncheon': {'z':13,'x0':6995,'y0':3244,'nx':4,'ny':4,'cities':['순천'],'major_only':False},
 'gwangyang':{'z':13,'x0':7000,'y0':3245,'nx':4,'ny':3,'cities':['광양'],'major_only':False},
}
MAJOR={'motorway','trunk','primary','secondary','motorway_link','trunk_link','primary_link'}
ALLROADS=MAJOR|{'tertiary','residential','unclassified','living_street','secondary_link','tertiary_link'}
W={'motorway':3,'trunk':3,'motorway_link':1.6,'trunk_link':1.6,'primary':2.6,'primary_link':1.4,
   'secondary':2.1,'secondary_link':1.3,'tertiary':1.7,'tertiary_link':1.2,
   'residential':1.2,'unclassified':1.2,'living_street':1.1}

def y2lat(yt,n): return math.degrees(math.atan(math.sinh(math.pi*(1-2*yt/n))))
def bounds(m):
    n=2**m['z']; west=m['x0']/n*360-180; east=(m['x0']+m['nx'])/n*360-180
    return y2lat(m['y0']+m['ny'],n), west, y2lat(m['y0'],n), east  # S,W,N,E
def proj(lat,lng,m):
    n=2**m['z']; xt=(lng+180)/360*n
    yt=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    return ((xt-m['x0'])*256*SS,(yt-m['y0'])*256*SS)

def fetch_roads(m,key):
    cache=f'/tmp/roads_{key}.json'
    if os.path.exists(cache) and os.path.getsize(cache)>100: return json.load(open(cache))
    S,Wd,N,E=bounds(m)
    cls='|'.join(sorted(MAJOR if m['major_only'] else ALLROADS))
    q=f'[out:json][timeout:80];way[highway~"^({cls})$"]({S},{Wd},{N},{E});out geom;'
    for attempt in range(3):
        r=subprocess.run(['curl','-s','--max-time','90','-X','POST','https://overpass-api.de/api/interpreter',
                          '-H',f'User-Agent: {UA}','--data-urlencode','data='+q,'-o',cache],capture_output=True)
        try:
            d=json.load(open(cache)); 
            if 'elements' in d: return d
        except: pass
        time.sleep(6)
    return {'elements':[]}

# 행정동 경계 (여수/순천/광양)
hjd=json.load(open(HJD))
dong={}
for f in hjd['features']:
    nm=f.get('properties',{}).get('adm_nm','')
    for c in ['여수','순천','광양']:
        if c in nm: dong.setdefault(c,[]).append(f)

def rings(geom):
    out=[]
    if geom['type']=='Polygon': polys=[geom['coordinates']]
    elif geom['type']=='MultiPolygon': polys=geom['coordinates']
    else: return out
    for poly in polys:
        for ring in poly: out.append(ring)  # [[lng,lat],...]
    return out

for key,m in MAPS.items():
    Wpx,Hpx=m['nx']*256*SS, m['ny']*256*SS
    road_mask=Image.new('L',(Wpx,Hpx),0); rd=ImageDraw.Draw(road_mask)
    bnd_mask=Image.new('L',(Wpx,Hpx),0); bd=ImageDraw.Draw(bnd_mask)
    # roads
    data=fetch_roads(m,key); nr=0
    for el in data.get('elements',[]):
        g=el.get('geometry'); 
        if not g or len(g)<2: continue
        hw=el.get('tags',{}).get('highway','residential')
        w=max(1,round(W.get(hw,1.2)*SS))
        pts=[proj(p['lat'],p['lon'],m) for p in g]
        rd.line(pts,fill=255,width=w,joint='curve'); nr+=1
    # dong boundaries
    nb=0
    for c in m['cities']:
        for f in dong.get(c,[]):
            for ring in rings(f['geometry']):
                pts=[proj(pt[1],pt[0],m) for pt in ring]
                if len(pts)>1: bd.line(pts,fill=255,width=max(1,round(1.6*SS)),joint='curve'); nb+=1
    # composite accent RGBA: alpha = roads 20% 아래 + boundaries 50% 위
    ov=Image.new('RGBA',(Wpx,Hpx),(ACCENT[0],ACCENT[1],ACCENT[2],0))
    alpha=Image.new('L',(Wpx,Hpx),0)
    ap=alpha.load(); rp=road_mask.load(); bp=bnd_mask.load()
    for y in range(Hpx):
        for x in range(Wpx):
            a=51 if rp[x,y] else 0
            if bp[x,y]: a=128
            if a: ap[x,y]=a
    ov.putalpha(alpha)
    ov=ov.resize((m['nx']*256,m['ny']*256),Image.LANCZOS)
    ov.save(os.path.join(OUT,f'promomap-ov-{key}.png'))
    print(f"{key}: roads {nr} · 경계선 {nb} · {os.path.getsize(os.path.join(OUT,f'promomap-ov-{key}.png'))//1024}KB")
