import os
from PIL import Image

img = Image.open(r'C:\Users\HGP\.gemini\antigravity-ide\brain\5e472c6c-e454-4b37-9f35-fe20210e09b1\.user_uploaded\media_1790161412969.png')
print(f"Loaded image {img.size}")

# Let's crop into 10 vertical slices so each slice is about 102 pixels high
# and upscale them 3x with BICUBIC to make text legible
out_dir = r'C:\Users\HGP\.gemini\antigravity-ide\brain\5e472c6c-e454-4b37-9f35-fe20210e09b1\scratch\upscaled_slices'
os.makedirs(out_dir, exist_ok=True)

h_step = img.height // 10
for i in range(10):
    box = (0, i * h_step, img.width, min((i + 1) * h_step, img.height))
    crop = img.crop(box)
    upscaled = crop.resize((crop.width * 3, crop.height * 3), Image.Resampling.LANCZOS)
    upscaled.save(os.path.join(out_dir, f'slice_{i}.png'))

print("Saved 10 upscaled slices!")
