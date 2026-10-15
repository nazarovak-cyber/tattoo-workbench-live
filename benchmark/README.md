# Exact Engine benchmark

`synthetic-linework.png` is a non-private browser smoke-test image with distinct shapes and lettering.

Add consented, non-private examples to these categories: `lettering`, `floral`, `blackwork`, `ornament`, `graphic`, `hand_drawn`, `geometric`, and `noisy_photo`. Keep source images and artist-approved expected masks in each category. The first regression suite uses synthetic art in `backend/tests/test_exact.py` so it can run without uploading private tattoo designs.

Target corpus: 3 lettering, 3 floral, 3 blackwork, 3 ornament, 3 graphic, 2 hand-drawn, 2 geometric, 1 noisy photo. Record source, expected, generated and metrics per sample. Do not treat an automated score as proof of artist approval.
