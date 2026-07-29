import os
from PIL import Image

def generate_icons():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(base_dir, 'src', 'assets', 'Green-Energy-Solution.png')
    public_dir = os.path.join(base_dir, 'public')

    if not os.path.exists(logo_path):
        print(f"Error: Logo not found at {logo_path}")
        return

    logo = Image.open(logo_path).convert("RGBA")
    logo_w, logo_h = logo.size

    def create_square_icon(size, bg_color=(255, 255, 255, 0), padding_pct=0.1):
        # Create canvas
        canvas = Image.new("RGBA", (size, size), bg_color)
        
        # Available dimensions with padding
        target_max = int(size * (1 - 2 * padding_pct))
        
        # Calculate aspect ratio scaling
        scale = min(target_max / logo_w, target_max / logo_h)
        new_w = int(logo_w * scale)
        new_h = int(logo_h * scale)
        
        # Resize logo
        resized_logo = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # Center logo
        offset_x = (size - new_w) // 2
        offset_y = (size - new_h) // 2
        canvas.paste(resized_logo, (offset_x, offset_y), resized_logo)
        return canvas

    # 1. pwa-192x192.png (Transparent background)
    icon_192 = create_square_icon(192, bg_color=(255, 255, 255, 0), padding_pct=0.08)
    icon_192.save(os.path.join(public_dir, 'pwa-192x192.png'), 'PNG')
    print("Generated pwa-192x192.png")

    # 2. pwa-512x512.png (Transparent background)
    icon_512 = create_square_icon(512, bg_color=(255, 255, 255, 0), padding_pct=0.08)
    icon_512.save(os.path.join(public_dir, 'pwa-512x512.png'), 'PNG')
    print("Generated pwa-512x512.png")

    # 3. pwa-512x512-maskable.png (Solid white background for Android safe zone compliance)
    icon_maskable = create_square_icon(512, bg_color=(255, 255, 255, 255), padding_pct=0.18)
    icon_maskable.save(os.path.join(public_dir, 'pwa-512x512-maskable.png'), 'PNG')
    print("Generated pwa-512x512-maskable.png")

    # 4. apple-touch-icon.png (180x180 solid background)
    icon_apple = create_square_icon(180, bg_color=(255, 255, 255, 255), padding_pct=0.1)
    icon_apple.save(os.path.join(public_dir, 'apple-touch-icon.png'), 'PNG')
    print("Generated apple-touch-icon.png")

    # 5. favicon.png (64x64 transparent background)
    icon_favicon = create_square_icon(64, bg_color=(255, 255, 255, 0), padding_pct=0.05)
    icon_favicon.save(os.path.join(public_dir, 'favicon.png'), 'PNG')
    print("Generated favicon.png")

if __name__ == "__main__":
    generate_icons()
