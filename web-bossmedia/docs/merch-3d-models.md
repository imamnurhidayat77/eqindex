# Merch 3D models: the standard

Prices, colours, sizes, slot labels and print sizes are edited in Studio >
Admin > Merch catalog (no code). A 3D model is the one part that still needs
a developer: every generated file so far needed fixing before it looked right.

## Where files live

| Folder | What | Served |
| --- | --- | --- |
| `public/models/rider/` | Rider tops and cap, one GLB per product + `LICENSE-*.md` | yes |
| `public/models/horse/` | `horse-client.glb`, the gear files the app loads (`*-studio.glb`, `*-on-horse.glb`, `horse-<gear>.glb`) | yes |
| `models-src/horse/` | The client's untouched Tripo exports, input for the scripts | no |
| `public/merch/<product-id>/` | `cutout.png` (storefront) and `front/side-left/side-right/back.jpg` | yes |

Never put a source or test file under `public/`: everything there is
downloadable by every visitor.

## File rules

- glTF binary (`.glb`), Y up, one mesh with UVs and a base colour texture.
- Light or neutral base colour: the colour picker tints the texture. Parts
  that must keep their own colour (piping, buckles) need their own material.
- At most 1.5 MB and about 30k triangles per served file (meshopt, texture
  1024 px or smaller). The horse may be larger.
- A licence note next to every file that did not come from the client.
- `cutout.png`: 800 x 800, transparent background, product centred.

## Rider products (tops, cap)

Any shirt-shaped model works: `Merch3D.jsx` scales every top to width 1 with
the hem at y 0, so the shared slot table (`DECALS['top-glb']`) fits it. Drop
the file in `public/models/rider/` and point `RIDER_MODELS` in
`lib/merch.mjs` at it. Check every slot on screen before shipping.

## Horse products

1. Generate in Tripo with the gear already worn by the client's plain horse.
   Script-bent or cloth-simulated gear was rejected (looks crumpled).
2. Tripo redraws the horse each time and usually doubles the lower legs:
   `RAW=1 node scripts/fix-horse-legs.mjs <worn.glb> <fixed.glb>`.
3. Cut the gear from its horse:
   `COLLAR=<x,y,r> ZBACK=<z> node scripts/split-worn-rug.mjs <fixed.glb> <gear-on-horse.glb> <horse-gear.glb>`.
   COLLAR and ZBACK differ per file and are found by looking at the result.
4. Studio view (no horse): put the untouched export in `models-src/horse/`
   and run `node scripts/fit-horse-gear.mjs <name>`, which writes
   `<name>-studio.glb`.
5. Tune the logo zones in `components/HorseGear.jsx` (`*_ZONES_*`) and the
   camera in `FRAMING` until every slot sits on a flat part of the gear.

Expect half a day to a day per horse product.

## A new product

Two kinds, very different cost:

- **Same shape as an existing product** (a hoodie on the jacket model, a
  show rug on the warm rug model): Studio > Admin > Merch catalog > Add a
  product. Pick the model, set name, price, colours, sizes and logo spots.
  It starts hidden. Logo spot positions and shop photos come from the
  model. A top can use its own GLB: put it in `public/models/rider/` and
  enter `/models/rider/<name>.glb` (needs a deploy of the web app).
- **A new shape** (boots, bag, helmet): needs a renderer, slot positions
  and a camera framing in code. Add it to `MERCH_PRODUCTS` and
  `MERCH_POSITIONS_BY_PRODUCT` in `lib/merch.mjs` and wire its 3D view.
  From then on it is a model other products can reuse.
