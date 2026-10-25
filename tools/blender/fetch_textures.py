"""Download CC0 photo textures from Poly Haven for the renders (run on the CI runner).

Writes tools/blender/tex/<slot>_diff.jpg and <slot>_rough.jpg (where available)
and tex/textures.json listing which Poly Haven asset filled each slot. Any slot
that can't be filled is skipped and the render falls back to its procedural
material, so a network hiccup never breaks a render.
"""
import json, os, sys, urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex')
RES = sys.argv[1] if len(sys.argv) > 1 else '2k'
API = 'https://api.polyhaven.com'
UA = {'User-Agent': 'magic-window-render/1.0 (github.com/prevattj21/magic-window)'}

# slot -> preferred asset-name keywords, best first
SLOTS = {
    'marble':   ['white_marble', 'marble_01', 'marble'],
    'stone':    ['castle_wall_slates', 'stone_wall', 'castle_wall', 'rock_wall', 'stone_brick'],
    'plaster':  ['painted_plaster', 'plastered_wall', 'plaster', 'stucco', 'concrete_wall'],
    'paving':   ['stone_tiles', 'cobblestone_floor', 'paving_stones', 'floor_tiles', 'cobblestone'],
    'roof':     ['roof_tiles', 'clay_roof', 'roof'],
    'ground':   ['aerial_grass', 'grass_path', 'forrest_ground', 'grass'],
    'cobble':   ['cobblestone_floor', 'cobblestone', 'cobble', 'stone_tiles'],
    'foliage':  ['leaves', 'hedge', 'moss'],
}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()

def main():
    os.makedirs(OUT, exist_ok=True)
    assets = json.loads(get(f'{API}/assets?t=textures'))
    names = sorted(assets.keys())
    chosen = {}
    for slot, keys in SLOTS.items():
        pick = None
        for k in keys:
            hits = [n for n in names if k in n]
            if hits: pick = sorted(hits, key=len)[0]; break
        if not pick:
            print(f'{slot}: no match'); continue
        try:
            files = json.loads(get(f'{API}/files/{pick}'))
            got = {}
            for kind, keys2 in (('diff', ['Diffuse', 'diff']), ('rough', ['Rough', 'rough'])):
                entry = next((files[k] for k in keys2 if k in files), None)
                if not entry: continue
                res = RES if RES in entry else sorted(entry.keys())[0]
                url = entry[res]['jpg']['url'] if 'jpg' in entry[res] else entry[res]['png']['url']
                path = os.path.join(OUT, f'{slot}_{kind}.jpg')
                with open(path, 'wb') as f: f.write(get(url))
                got[kind] = url
            if 'diff' in got:
                chosen[slot] = {'asset': pick, 'name': assets[pick].get('name', pick), 'files': got, 'license': 'CC0 (polyhaven.com)'}
                print(f'{slot}: {pick}')
        except Exception as e:
            print(f'{slot}: failed {pick}: {e}')
    with open(os.path.join(OUT, 'textures.json'), 'w') as f: json.dump(chosen, f, indent=1)

if __name__ == '__main__':
    try: main()
    except Exception as e: print('texture fetch failed, using procedural materials:', e)
