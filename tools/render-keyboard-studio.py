"""Offline Cycles lighting bake for the supplied keyboard 3MF. No runtime 3D viewer."""
import argparse
import base64
import hashlib
import json
import math
import struct
import sys
import zipfile
import zlib
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
try:
    import bpy
    from mathutils import Vector
except ModuleNotFoundError:
    bpy=None

NS = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
PROD = '{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}path'
HOLDERS = {1:'32',2:'30',3:'7',4:'25',5:'17',6:'13',7:'23',8:'19',9:'15',10:'11'}
PITCH = 17.5
ELEVATION = 65
SCALE = 10
UP = np.array([0, math.sin(math.radians(ELEVATION)), math.cos(math.radians(ELEVATION))])


def srgb(hex_color):
    values = [int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)


def plastic(name, pigment, role):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.pass_index=role
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=srgb(pigment)
    p.inputs['Roughness'].default_value=.46;p.inputs['IOR'].default_value=1.46
    p.inputs['Specular IOR Level'].default_value=.32;p.inputs['Coat Weight'].default_value=.03
    p.inputs['Coat Roughness'].default_value=.3
    # Fine layer lines on vertical walls, and a restrained printed top texture.
    geo=nodes.new('ShaderNodeNewGeometry');sep=nodes.new('ShaderNodeSeparateXYZ');links.new(geo.outputs['Position'],sep.inputs[0])
    freq=nodes.new('ShaderNodeMath');freq.operation='MULTIPLY';freq.inputs[1].default_value=2*math.pi/.16;links.new(sep.outputs['Z'],freq.inputs[0])
    wave=nodes.new('ShaderNodeMath');wave.operation='SINE';links.new(freq.outputs[0],wave.inputs[0])
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=22;noise.inputs['Detail'].default_value=2
    links.new(geo.outputs['Position'],noise.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.02;links.new(noise.outputs['Fac'],bump.inputs['Height'])
    layers=nodes.new('ShaderNodeBump');layers.inputs['Strength'].default_value=.22;layers.inputs['Distance'].default_value=.014;links.new(wave.outputs[0],layers.inputs['Height']);links.new(bump.outputs['Normal'],layers.inputs['Normal'])
    diagonal=nodes.new('ShaderNodeMath');diagonal.operation='ADD';links.new(sep.outputs['X'],diagonal.inputs[0]);links.new(sep.outputs['Y'],diagonal.inputs[1])
    skin_frequency=nodes.new('ShaderNodeMath');skin_frequency.operation='MULTIPLY';skin_frequency.inputs[1].default_value=2*math.pi/.32;links.new(diagonal.outputs[0],skin_frequency.inputs[0])
    skin_wave=nodes.new('ShaderNodeMath');skin_wave.operation='SINE';links.new(skin_frequency.outputs[0],skin_wave.inputs[0])
    normal=nodes.new('ShaderNodeSeparateXYZ');links.new(geo.outputs['Normal'],normal.inputs[0])
    strength=nodes.new('ShaderNodeMath');strength.operation='MULTIPLY';strength.inputs[1].default_value=.22;links.new(normal.outputs['Z'],strength.inputs[0])
    skin=nodes.new('ShaderNodeBump');skin.inputs['Distance'].default_value=.014;links.new(strength.outputs[0],skin.inputs['Strength']);links.new(skin_wave.outputs[0],skin.inputs['Height']);links.new(layers.outputs['Normal'],skin.inputs['Normal']);links.new(skin.outputs['Normal'],p.inputs['Normal'])
    aov=nodes.new('ShaderNodeOutputAOV');aov.name='Regions';aov.aov_name='Regions';aov.inputs['Color'].default_value=tuple(1 if i==role-1 else 0 for i in range(3))+(1,)
    return mat


def load_source(path):
    archive=zipfile.ZipFile(path);root=ET.fromstring(archive.read('3D/3dmodel.model'));config=ET.fromstring(archive.read('Metadata/model_settings.config'))
    objects={o.get('id'):o for o in root.findall('m:resources/m:object',NS)};cache={}
    def mesh(component, transform=False):
        path=component.get(PROD).lstrip('/')
        if path not in cache:cache[path]=ET.fromstring(archive.read(path))
        obj=next(o for o in cache[path].findall('m:resources/m:object',NS) if o.get('id')==component.get('objectid'))
        v=np.array([[float(p.get(a)) for a in ('x','y','z')] for p in obj.findall('m:mesh/m:vertices/m:vertex',NS)])
        f=np.array([[int(p.get(a)) for a in ('v1','v2','v3')] for p in obj.findall('m:mesh/m:triangles/m:triangle',NS)])
        matrix=[float(x) for x in component.get('transform','').split()]
        if transform and len(matrix)==12:v=v @ np.array(matrix[:9]).reshape(3,3)+matrix[9:12]
        return v,f
    cap,faces=mesh(objects['3'].find('m:components/m:component',NS));shift=22-cap[:,2].max();cap[:,2]+=shift
    holders={}
    for n,oid in HOLDERS.items():
        v,f=mesh(objects[oid].find('m:components/m:component',NS));v[:,2]-=v[:,2].min();holders[n]=(v,f)
    texts={p.get('id'):p.find('text_info').get('text') for p in config.findall('.//part') if p.find('text_info') is not None};glyphs={}
    for obj in objects.values():
        for component in obj.findall('m:components/m:component',NS):
            char=texts.get(component.get('objectid'))
            if not char or char in glyphs:continue
            v,f=mesh(component,True);v[:,2]+=shift;glyphs[char]=(v,f)
    archive.close();return (cap,faces),holders,glyphs


def object_from_mesh(name, geometry, material):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(geometry[0].tolist(),[],geometry[1].tolist());mesh.update()
    mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons));mesh.set_sharp_from_angle(angle=math.radians(40))
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(material)
    return obj


def scene_setup():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.cycles.seed=19
    scene.cycles.max_bounces=6;scene.cycles.diffuse_bounces=3;scene.cycles.glossy_bounces=3
    scene.render.film_transparent=True;scene.render.resolution_percentage=100
    scene.world.color=(.18,.18,.18);scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.8,.85,1,1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.25
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
    for name,loc,power,size in [('Window',(-55,-65,125),105000,90),('Fill',(75,-5,75),27000,100),('Rim',(-15,75,95),50000,65)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
        obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,10))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.objects.new('Fixed camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(camera);scene.camera=camera
    camera.data.type='ORTHO';camera.location=(0,-180*math.cos(math.radians(ELEVATION)),180*math.sin(math.radians(ELEVATION)))
    camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
    return scene


def frame(scene, vertices):
    projected=np.column_stack((vertices[:,0],-(vertices @ UP)))
    lower=np.floor(projected.min(axis=0)*SCALE)-140;upper=np.ceil(projected.max(axis=0)*SCALE)+140
    width=int(upper[0]-lower[0]);height=int(upper[1]-lower[1])
    if width<height:
        extra=height-width;lower[0]-=extra//2;upper[0]+=extra-extra//2;width=height
    center=(lower+upper)/(2*SCALE)
    target=Vector((center[0],0,0))-Vector(UP)*center[1]
    scene.camera.location=target+Vector((0,-180*math.cos(math.radians(ELEVATION)),180*math.sin(math.radians(ELEVATION))))
    scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.ortho_scale=width/SCALE
    scene.render.resolution_x=width;scene.render.resolution_y=height
    return (-lower).tolist()


def png(array):
    def chunk(name,body):return struct.pack('!I',len(body))+name+body+struct.pack('!I',zlib.crc32(name+body)&0xffffffff)
    h,w=array.shape[:2];raw=b''.join(b'\0'+row.tobytes() for row in array)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    return 'data:image/png;base64,'+base64.b64encode(data).decode('ascii')


def split_assets(path):
    text=path.read_text(encoding='utf-8');data=json.loads(text[text.index('window.KeyboardRenderData=')+len('window.KeyboardRenderData='):].strip().removesuffix(';'))
    post_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    folder=path.parent/'keyboard-render'/(data['recipeSha256'][:12]+'-'+post_hash[:8]);folder.mkdir(parents=True,exist_ok=True)
    postprocessed=bool(data.get('mapsPostprocessed'));can_postprocess=False
    for group in ('trays','glyphs'):
        for key,entry in data[group].items():
            name=('tray-'+key if group=='trays' else 'glyph-'+str(ord(key)))+'.png';target=folder/name
            raw=base64.b64decode(entry['image'].split(',',1)[1]) if entry['image'].startswith('data:') else Path(entry['image']).read_bytes()
            # Lossless PNG filtering reduces transfers without changing material IDs.
            try:
                import io
                from PIL import Image,ImageFilter
                can_postprocess=True;pixels=np.array(Image.open(io.BytesIO(raw)).convert('RGBA'))
                if not postprocessed:
                    if group=='trays':
                        background=(pixels[:,:,0]==0)|(pixels[:,:,0]==4)
                        weights=Image.fromarray((background*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(8))
                        alpha=Image.fromarray(np.where(background,pixels[:,:,3],0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(8))
                        soft=np.clip(np.array(alpha).astype(float)*255/np.maximum(np.array(weights),1),0,255).astype(np.uint8)
                        yy,xx=np.indices(soft.shape);edge=np.minimum.reduce([xx,yy,soft.shape[1]-1-xx,soft.shape[0]-1-yy]);fade=np.clip(edge/80,0,1);fade=fade*fade*(3-2*fade);soft=np.rint(soft*fade).astype(np.uint8)
                        pixels[background,0]=np.where(soft[background]>0,4,0);pixels[background,1:3]=0;pixels[background,3]=soft[background]
                    else:
                        # Keep the receiving key's original lighting outside the
                        # letter and its local contact shadow, with a soft join.
                        glyph=Image.fromarray(np.where(pixels[:,:,0]==3,pixels[:,:,3],0).astype(np.uint8))
                        nearby=np.array(glyph.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(2)))
                        key=pixels[:,:,0]==2;pixels[key,3]=(pixels[key,3].astype(float)*nearby[key]/255).astype(np.uint8)
                    pixels[pixels[:,:,3]==0]=0
                    # Wide ID spacing survives the browser canvas premultiply /
                    # unpremultiply round-trip at soft, partially covered edges.
                    pixels[:,:,0]=np.minimum(pixels[:,:,0].astype(np.uint16)*64,255).astype(np.uint8)
                Image.fromarray(pixels).save(target,optimize=True)
            except ImportError:target.write_bytes(raw)
            entry['image']=target.resolve().relative_to(Path.cwd().resolve()).as_posix()
    if can_postprocess:data['mapsPostprocessed']=True;data['materialEncoding']='spaced-red-v1';data['postprocessSha256']=post_hash
    path.write_text('/* Path-traced PLA maps, loaded only for the selected length and characters. */\nwindow.KeyboardRenderData='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
    print('SPLIT',len(data['trays'])+len(data['glyphs']),'maps; manifest',path.stat().st_size,flush=True)


def passes_setup(scene, output):
    layer=bpy.context.view_layer
    layer.use_pass_diffuse_direct=True;layer.use_pass_diffuse_indirect=True
    layer.use_pass_glossy_direct=True;layer.use_pass_glossy_indirect=True
    layer.use_pass_diffuse_color=True;layer.use_pass_glossy_color=True;layer.use_pass_normal=True
    aov=layer.aovs.add();aov.name='Regions';aov.type='COLOR'
    scene.use_nodes=True;tree=scene.node_tree;tree.nodes.clear();source=tree.nodes.new('CompositorNodeRLayers')
    sink=tree.nodes.new('CompositorNodeOutputFile');sink.base_path=str(output.resolve());sink.format.file_format='OPEN_EXR';sink.format.color_depth='32';sink.file_slots.clear()
    def add(name,a,b):
        mix=tree.nodes.new('CompositorNodeMixRGB');mix.blend_type='ADD';mix.inputs[0].default_value=1;tree.links.new(source.outputs[a],mix.inputs[1]);tree.links.new(source.outputs[b],mix.inputs[2]);return mix.outputs[0]
    def lighting(name,direct,indirect,reflectance):
        multiply=tree.nodes.new('CompositorNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        tree.links.new(add(name,direct,indirect),multiply.inputs[1]);tree.links.new(source.outputs[reflectance],multiply.inputs[2])
        denoise=tree.nodes.new('CompositorNodeDenoise');denoise.prefilter='ACCURATE';tree.links.new(multiply.outputs[0],denoise.inputs['Image']);tree.links.new(source.outputs['Normal'],denoise.inputs['Normal']);tree.links.new(source.outputs['DiffCol'],denoise.inputs['Albedo']);return denoise.outputs[0]
    for name,socket in [('diffuse',lighting('diffuse','DiffDir','DiffInd','DiffCol')),('specular',lighting('specular','GlossDir','GlossInd','GlossCol')),('regions',source.outputs['Regions']),('beauty',source.outputs['Image'])]:
        sink.file_slots.new(name);tree.links.new(socket,sink.inputs[name])


def read_pass(output,name):
    path=output/(name+'0001.exr');image=bpy.data.images.load(str(path.resolve()),check_existing=False)
    pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)[::-1].copy();bpy.data.images.remove(image);return pixels


def bake(scene,output):
    bpy.ops.render.render()
    diffuse=read_pass(output,'diffuse');specular=read_pass(output,'specular');regions=read_pass(output,'regions');beauty=read_pass(output,'beauty')
    coverage=np.clip(regions[:,:,:3].sum(axis=2),0,1);has=coverage>.001;labels=regions[:,:,:3].argmax(axis=2)+1
    alpha=np.where(has,coverage,beauty[:,:,3]);labels=np.where(has,labels,np.where(alpha>.001,4,0))
    # Store radiance, specular and true antialiased coverage separately from pigment.
    packed=np.zeros(diffuse.shape,dtype=np.uint8);packed[:,:,0]=labels
    packed[:,:,1]=np.rint(np.sqrt(np.clip(diffuse[:,:,:3].mean(axis=2),0,2)/2)*255).astype(np.uint8)
    packed[:,:,2]=np.rint(np.sqrt(np.clip(specular[:,:,:3].mean(axis=2),0,1))*255).astype(np.uint8)
    packed[:,:,3]=np.rint(alpha*255).astype(np.uint8)
    return packed


def glyph_entry(packed,baseline,origin):
    # Blender rounds the crop origin to full pixels. Recover that exact origin
    # from the unchanged receiving key instead of assuming float border rounding.
    by,bx=np.where(baseline[:,:,0]==2);gy,gx=np.where(packed[:,:,0]==2)
    x0=int(bx.min()-gx.min());y0=int(by.min()-gy.min())
    base=baseline[y0:y0+packed.shape[0],x0:x0+packed.shape[1]]
    changed=(packed[:,:,0]==3)|((packed[:,:,0]==2)&(base[:,:,0]==2)&(np.max(np.abs(packed[:,:,1:3].astype(int)-base[:,:,1:3].astype(int)),axis=2)>2))
    yy,xx=np.where(changed)
    if not len(xx):raise ValueError('Glyph has no visible surface')
    left=max(0,int(xx.min())-3);right=min(packed.shape[1],int(xx.max())+4);top=max(0,int(yy.min())-3);bottom=min(packed.shape[0],int(yy.max())+4)
    patch=packed[top:bottom,left:right].copy();patch[:,:,3]=np.where((patch[:,:,0]==2)|(patch[:,:,0]==3),patch[:,:,3],0)
    return {'image':png(patch),'offset':[x0+left-origin[0],y0+top-origin[1]]}


def repack_cache(path,cache):
    text=path.read_text(encoding='utf-8');data=json.loads(text[text.index('window.KeyboardRenderData=')+len('window.KeyboardRenderData='):].strip().removesuffix(';'))
    baseline=np.load(cache/'tray-1.npz')['pixels']
    for n,entry in data['trays'].items():entry['image']=png(np.load(cache/('tray-'+n+'.npz'))['pixels'])
    for char in data['glyphs']:data['glyphs'][char]=glyph_entry(np.load(cache/('glyph-'+str(ord(char))+'.npz'))['pixels'],baseline,data['trays']['1']['origin'])
    data['mapsPostprocessed']=False;data['cropAlignment']='material-silhouette'
    staging=path.with_suffix('.staging');staging.write_text('window.KeyboardRenderData='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8');split_assets(staging);staging.replace(path)


def bake_bank(args,cap,holders,glyphs,scene):
    output=Path('qa-results/keycap-preview/cycles-passes');output.mkdir(parents=True,exist_ok=True);passes_setup(scene,output)
    mats=[plastic('Tray neutral','#FFFFFF',1),plastic('Buttons neutral','#FFFFFF',2),plastic('Characters neutral','#FFFFFF',3)]
    tray=object_from_mesh('Original tray',holders[1],mats[0]);master=object_from_mesh('Original keycap',cap,mats[1]);caps=[master]
    for i in range(1,10):obj=bpy.data.objects.new('Cap '+str(i),master.data);scene.collection.objects.link(obj);caps.append(obj)
    bpy.ops.mesh.primitive_plane_add(size=500,location=(0,0,-.12));floor=bpy.context.object;floor.is_shadow_catcher=True;floor.data.materials.append(plastic('Ground','#FFFFFF',0))
    source_hash=hashlib.sha256(args.source.read_bytes()).hexdigest();recipe=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    cache=output.parent/('cycles-cache-'+source_hash[:12]+'-'+recipe[:12]);cache.mkdir(exist_ok=True)
    result={'version':2,'engine':'Blender Cycles 4.5','specularReflectanceApplied':True,'samples':{'trays':64,'glyphs':48},'scale':SCALE,'pitch':PITCH,'cameraElevation':ELEVATION,'sourceSha256':source_hash,'recipeSha256':recipe,'trays':{},'glyphs':{},'font':'Caprasimo','capSize':17.246}
    baseline=None
    for n in range(1,11):
        old=tray.data;geometry=holders[n];mesh=bpy.data.meshes.new('Tray '+str(n));mesh.from_pydata(geometry[0].tolist(),[],geometry[1].tolist());mesh.update();mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons));mesh.set_sharp_from_angle(angle=math.radians(40));mesh.materials.append(mats[0]);tray.data=mesh;bpy.data.meshes.remove(old)
        for i,obj in enumerate(caps):obj.hide_render=i>=n;obj.location.x=(i-(n-1)/2)*PITCH
        vertices=np.vstack((geometry[0],cap[0]+[-(n-1)*PITCH/2,0,1.5],cap[0]+[(n-1)*PITCH/2,0,1.5]))
        origin=frame(scene,vertices);cached=cache/('tray-'+str(n)+'.npz')
        if cached.exists():packed=np.load(cached)['pixels']
        else:packed=bake(scene,output);np.savez_compressed(cached,pixels=packed)
        result['trays'][str(n)]={'image':png(packed),'width':packed.shape[1],'height':packed.shape[0],'origin':origin}
        if n==1:baseline=packed.copy();base_origin=origin
        print('BAKED realistic tray',n,flush=True)
    # Bake raised letters together with their receiving key so the contact shadow
    # can be composited along with each arbitrary character at runtime.
    geometry=holders[1];mesh=bpy.data.meshes.new('Glyph tray');mesh.from_pydata(geometry[0].tolist(),[],geometry[1].tolist());mesh.materials.append(mats[0]);tray.data=mesh
    for i,obj in enumerate(caps):obj.hide_render=i>0;obj.location.x=0
    origin=frame(scene,np.vstack((geometry[0],cap[0]+[0,0,1.5])))
    scene.cycles.samples=48
    projected=np.column_stack((cap[0][:,0]*SCALE+origin[0],-(cap[0]@UP)*SCALE+origin[1]))
    x0,y0=np.maximum(0,np.floor(projected.min(axis=0)).astype(int)-18);x1,y1=np.minimum([baseline.shape[1],baseline.shape[0]],np.ceil(projected.max(axis=0)).astype(int)+18)
    scene.render.use_border=True;scene.render.use_crop_to_border=True
    scene.render.border_min_x=(x0+.01)/baseline.shape[1];scene.render.border_max_x=(x1+.01)/baseline.shape[1]
    scene.render.border_min_y=(baseline.shape[0]-y1+.01)/baseline.shape[0];scene.render.border_max_y=(baseline.shape[0]-y0+.01)/baseline.shape[0]
    for char,geometry in glyphs.items():
        letter=object_from_mesh('Letter '+char,geometry,mats[2]);cached=cache/('glyph-'+str(ord(char))+'.npz')
        if cached.exists():packed=np.load(cached)['pixels']
        else:packed=bake(scene,output);np.savez_compressed(cached,pixels=packed)
        result['glyphs'][char]=glyph_entry(packed,baseline,origin)
        bpy.data.objects.remove(letter,do_unlink=True);print('BAKED realistic glyph',repr(char),flush=True)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text('/* Path-traced PLA lighting from the supplied 3MF; pigments applied at runtime. */\nwindow.KeyboardRenderData='+json.dumps(result,separators=(',',':'))+';\n',encoding='utf-8')
    print('WROTE',args.output,args.output.stat().st_size,flush=True)
    split_assets(args.output)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path,nargs='?');parser.add_argument('--output',type=Path,default=Path('qa-results/keycap-preview/studio-sample.png'));parser.add_argument('--text',default='DIANE');parser.add_argument('--bake',action='store_true');parser.add_argument('--split',action='store_true');parser.add_argument('--repack-cache',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:])
    if args.split:return split_assets(args.output)
    if args.repack_cache:return repack_cache(args.output,args.repack_cache)
    if not args.source or bpy is None:parser.error('Rendering requires Blender and a source 3MF.')
    cap,holders,glyphs=load_source(args.source);scene=scene_setup()
    if args.bake:return bake_bank(args,cap,holders,glyphs,scene)
    mats=[plastic('Tray','#FBA8D0',1),plastic('Buttons','#FF9201',2),plastic('Characters','#BCEFFA',3)]
    object_from_mesh('Original tray',holders[len(args.text)],mats[0])
    master=object_from_mesh('Original keycap',cap,mats[1])
    for i,char in enumerate(args.text):
        x=(i-(len(args.text)-1)/2)*PITCH
        if i:obj=bpy.data.objects.new('Keycap '+str(i),master.data);scene.collection.objects.link(obj)
        else:obj=master
        obj.location.x=x
        if char in glyphs:letter=object_from_mesh(char,glyphs[char],mats[2]);letter.location.x=x
    bpy.ops.mesh.primitive_plane_add(size=500,location=(0,0,-.12));floor=bpy.context.object;floor.name='Soft contact shadow';floor.is_shadow_catcher=True
    floor.data.materials.append(plastic('Ground','#FFFFFF',0))
    frame(scene,np.vstack((holders[len(args.text)][0],cap[0]+[-(len(args.text)-1)*PITCH/2,0,1.5],cap[0]+[(len(args.text)-1)*PITCH/2,0,1.5])))
    args.output.parent.mkdir(parents=True,exist_ok=True);scene.render.image_settings.file_format='PNG';scene.render.filepath=str(args.output.resolve());bpy.ops.render.render(write_still=True)


if __name__=='__main__':main()
