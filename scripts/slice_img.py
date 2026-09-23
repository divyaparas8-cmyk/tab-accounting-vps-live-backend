from PIL import Image
import os

img_path = r'C:\Users\HGP\.gemini\antigravity-ide\brain\5e472c6c-e454-4b37-9f35-fe20210e09b1\.user_uploaded\media_1790161412969.png'
out_dir = r'C:\Users\HGP\.gemini\antigravity-ide\brain\5e472c6c-e454-4b37-9f35-fe20210e09b1\scratch\slices'
os.makedirs(out_dir, exist_ok=True)

img = Image.open(img_path)
w, h = img.size
print(f"Original size: {w}x{h}")

# Save high-res crops of sections
# Section 1: Header + Assets top (0% to 20%)
img.crop((0, 0, w, int(h * 0.20))).save(os.path.join(out_dir, 'sec1_assets_top.png'))
# Section 2: Assets middle (20% to 40%)
img.crop((0, int(h * 0.20), w, int(h * 0.40))).save(os.path.join(out_dir, 'sec2_assets_mid.png'))
# Section 3: Assets bottom + Liabilities (40% to 60%)
img.crop((0, int(h * 0.40), w, int(h * 0.60))).save(os.path.join(out_dir, 'sec3_assets_bot_liab.png'))
# Section 4: Liabilities + Equity + Income (60% to 80%)
img.crop((0, int(h * 0.60), w, int(h * 0.80))).save(os.path.join(out_dir, 'sec4_liab_eq_inc.png'))
# Section 5: Income + Expenses (80% to 100%)
img.crop((0, int(h * 0.80), w, int(h * 1.0))).save(os.path.join(out_dir, 'sec5_inc_exp.png'))

print("Saved all slices!")
