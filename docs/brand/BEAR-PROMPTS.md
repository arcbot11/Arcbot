# Bear artwork prompts

Mode: built-in image generation with local reference images; no CLI generation.

## Logo

Edit this exact brand image. Create a square standalone Arctos bear logo: completely remove the surrounding silver hexagon, reconstruct the same dark navy-to-blue gradient background seamlessly, and enlarge the existing silver polar bear so its width spans about 80% of the square. Center the bear horizontally and vertically. Preserve exactly its right-facing silhouette, angular snout, ear, tiny triangular eye, four legs, navy negative-space interior and pearly silver/icy-blue shading. No text, no frame, no hexagon, no added objects. Clean high-resolution edges, polished logo asset. Return one square image.

## Banner

Edit image 1, the existing Arctos Bot social banner. Image 2 supplies the exact new bear brand mark. Replace ONLY the large A-shaped robot icon on the right of the banner with the right-facing silver polar bear silhouette from image 2, WITHOUT its hexagon. Preserve the recognizable angular snout, ear, tiny eye and four-leg silhouette, pearly silver icy-blue shading. Fit the bear prominently in the right-hand area, grounded on the curved luminous horizon with a subtle contact shadow; no overlap with the text. Keep the entire banner's dark navy/teal gradient, fine orbital lines, lighting and composition. Preserve exact left-hand text: 'Arctos Bot' and beneath 'Your Gateway to Arc Chain.' Render the complete banner at a 3:1 aspect ratio, ideally 1536x512 or 2172x724, no cropping of text, no additional text or borders. Remove every trace of old A icon.

## Favicon

Make a square browser favicon master from this exact Arctos bear logo. Preserve its right-facing silhouette, angular snout, ear, legs and inner cutout. Remove texture and tiny detail that will not read at 16 to 32 pixels; use an almost-white silver bear mark with very subtle silver shading against a solid deep navy #061322 square. Enlarge the bear to 92% canvas width, centered vertically. The bear is the sole symbol; absolutely no hexagon, circle frame, letter A, text or outline border. Strong clean edges and bold leg shapes so it remains recognizable as a bear when reduced. Output one square high-resolution PNG.

## Transparent cutout

Remove background. Transparent PNG of this bear. Keep bear and eye, make navy background transparent.

Final transparency: after generated cutouts left artifacts, the user authorized local image processing. scripts/clean-bear-alpha.mjs extracts the silver mark from the clean opaque logo, removes small disconnected artifacts, and preserves the body, legs, and eye with antialiased alpha.
