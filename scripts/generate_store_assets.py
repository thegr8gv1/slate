import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = "store-assets"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -------------------------------------------------------------
# Fonts helper
# -------------------------------------------------------------
def get_font(size, bold=False):
    font_names = [
        "arialbd.ttf" if bold else "arial.ttf",
        "segoeuib.ttf" if bold else "segoeui.ttf",
        "tahoma.ttf",
        "verdana.ttf"
    ]
    for name in font_names:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()

# -------------------------------------------------------------
# 1. 512x512 App Icon
# -------------------------------------------------------------
def create_app_icon():
    src_path = "apps/slate/assets/images/icon.png"
    out_path = os.path.join(OUTPUT_DIR, "icon-512.png")
    if os.path.exists(src_path):
        img = Image.open(src_path).convert("RGBA")
        img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
        img_512.save(out_path, "PNG", optimize=True)
        print(f"Generated: {out_path} (512x512)")
    else:
        # Fallback generator
        img = Image.new("RGBA", (512, 512), (14, 6, 18, 255))
        draw = ImageDraw.Draw(img)
        # Gradient background
        for y in range(512):
            r = int(14 + (y / 512) * 20)
            g = int(6 + (y / 512) * 8)
            b = int(18 + (y / 512) * 26)
            draw.line([(0, y), (512, y)], fill=(r, g, b, 255))
        # Center symbol
        f = get_font(180, bold=True)
        draw.text((256, 256), "S", fill=(244, 63, 94, 255), anchor="mm", font=f)
        img.save(out_path, "PNG")
        print(f"Generated fallback: {out_path}")

# -------------------------------------------------------------
# 2. 1024x500 Feature Graphic
# -------------------------------------------------------------
def create_feature_graphic():
    width, height = 1024, 500
    img = Image.new("RGBA", (width, height), (14, 6, 18, 255))
    draw = ImageDraw.Draw(img)

    # Dark midnight plum diagonal gradient
    for y in range(height):
        for x in range(0, width, 4):
            progress = (x + y * 1.4) / (width + height * 1.4)
            r = int(14 + progress * 32)
            g = int(6 + progress * 14)
            b = int(18 + progress * 42)
            draw.rectangle([(x, y), (x + 4, y + 1)], fill=(r, g, b, 255))

    # Glow orb in upper right
    glow = Image.new("RGBA", (500, 500), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([50, 50, 450, 450], fill=(244, 63, 94, 65))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    img.paste(glow, (width - 400, -100), glow)

    # Glow orb in bottom left
    glow2 = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    gdraw2 = ImageDraw.Draw(glow2)
    gdraw2.ellipse([50, 50, 350, 350], fill=(192, 132, 252, 45))
    glow2 = glow2.filter(ImageFilter.GaussianBlur(60))
    img.paste(glow2, (-50, height - 300), glow2)

    # Logo Icon
    icon_path = os.path.join(OUTPUT_DIR, "icon-512.png")
    if os.path.exists(icon_path):
        icon = Image.open(icon_path).convert("RGBA").resize((170, 170), Image.Resampling.LANCZOS)
        # Rounded icon mask
        mask = Image.new("L", (170, 170), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, 170, 170], radius=38, fill=255)
        img.paste(icon, (80, (height - 170) // 2), mask)

    # Typography
    font_title = get_font(52, bold=True)
    font_sub = get_font(26, bold=True)
    font_desc = get_font(18, bold=False)

    text_x = 280
    draw.text((text_x, 135), "SLATE", fill=(255, 255, 255, 255), font=font_title)
    draw.text((text_x, 205), "The Modern Casting & Audition App", fill=(251, 113, 133, 255), font=font_sub)
    draw.text((text_x, 250), "Swipe-to-Cast  •  Self-Tape Auditions  •  Escrow Payouts", fill=(203, 213, 225, 255), font=font_desc)

    # Feature pills at bottom
    pills = ["VERIFIED PROFILES", "SAFE ESCROW CONTRACTS", "DIRECT CASTING DECK"]
    font_pill = get_font(12, bold=True)
    cur_x = text_x
    for pill in pills:
        bbox = font_pill.getbbox(pill)
        pw = bbox[2] - bbox[0] + 24
        ph = 28
        draw.rounded_rectangle([cur_x, 310, cur_x + pw, 310 + ph], radius=14, fill=(28, 12, 36, 200), outline=(244, 114, 182, 120), width=1)
        draw.text((cur_x + 12, 316), pill, fill=(244, 63, 94, 255), font=font_pill)
        cur_x += pw + 14

    out_path = os.path.join(OUTPUT_DIR, "feature-graphic.png")
    img.save(out_path, "PNG", optimize=True)
    print(f"Generated: {out_path} (1024x500)")

# -------------------------------------------------------------
# 3. Helper for Phone Screenshots (1080x1920)
# -------------------------------------------------------------
def create_screenshot(index, headline, subheadline, draw_content_fn):
    w, h = 1080, 1920
    img = Image.new("RGBA", (w, h), (14, 6, 18, 255))
    draw = ImageDraw.Draw(img)

    # Background ambient lighting
    for y in range(h):
        r = int(14 + (y / h) * 16)
        g = int(6 + (y / h) * 8)
        b = int(18 + (y / h) * 22)
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # Top ambient glow
    top_glow = Image.new("RGBA", (800, 400), (0, 0, 0, 0))
    tgdraw = ImageDraw.Draw(top_glow)
    tgdraw.ellipse([50, 20, 750, 380], fill=(244, 63, 94, 75))
    top_glow = top_glow.filter(ImageFilter.GaussianBlur(100))
    img.paste(top_glow, (140, -100), top_glow)

    # Marketing Header
    f_badge = get_font(22, bold=True)
    f_head = get_font(56, bold=True)
    f_sub = get_font(28, bold=False)

    badge_text = f"SLATE  •  FEATURE {index}"
    draw.text((w // 2, 90), badge_text, fill=(244, 63, 94, 255), anchor="mm", font=f_badge)
    draw.text((w // 2, 175), headline, fill=(255, 255, 255, 255), anchor="mm", font=f_head)
    draw.text((w // 2, 245), subheadline, fill=(203, 213, 225, 255), anchor="mm", font=f_sub)

    # Phone Frame dimensions
    phone_x1 = 120
    phone_y1 = 330
    phone_x2 = w - 120
    phone_y2 = h - 60
    phone_r = 54

    # Phone outer shadow
    phone_bg = Image.new("RGBA", (phone_x2 - phone_x1, phone_y2 - phone_y1), (22, 10, 28, 255))
    pdraw = ImageDraw.Draw(phone_bg)
    pdraw.rounded_rectangle([0, 0, phone_x2 - phone_x1, phone_y2 - phone_y1], radius=phone_r, fill=(20, 8, 26, 255), outline=(244, 114, 182, 90), width=3)

    # Status bar inside phone
    f_status = get_font(18, bold=True)
    pdraw.text((45, 26), "9:41", fill=(255, 255, 255, 200), font=f_status)
    pdraw.text((phone_x2 - phone_x1 - 100, 26), "5G  100%", fill=(255, 255, 255, 200), font=f_status)

    # Camera notch
    pdraw.rounded_rectangle([(phone_x2 - phone_x1) // 2 - 60, 20, (phone_x2 - phone_x1) // 2 + 60, 48], radius=14, fill=(10, 4, 14, 255))

    # Draw specific screen content
    draw_content_fn(pdraw, phone_x2 - phone_x1, phone_y2 - phone_y1)

    img.paste(phone_bg, (phone_x1, phone_y1), phone_bg)

    out_name = f"screenshot-{index}.png"
    out_path = os.path.join(OUTPUT_DIR, out_name)
    img.save(out_path, "PNG", optimize=True)
    print(f"Generated: {out_path} (1080x1920)")

# -------------------------------------------------------------
# Screenshot Content Renderers
# -------------------------------------------------------------

# Screen 1: Swipe to Cast Discovery Deck
def render_deck(draw, pw, ph):
    f_h = get_font(30, bold=True)
    f_t = get_font(20, bold=True)
    f_m = get_font(16, bold=False)

    # App bar
    draw.text((pw // 2, 85), "DISCOVER TALENT", fill=(255, 255, 255, 255), anchor="mm", font=f_h)
    draw.text((pw // 2, 120), "Los Angeles, CA  •  Within 35 mi", fill=(244, 63, 94, 255), anchor="mm", font=f_m)

    # Card
    cx1, cy1, cx2, cy2 = 40, 160, pw - 40, ph - 210
    draw.rounded_rectangle([cx1, cy1, cx2, cy2], radius=32, fill=(30, 12, 38, 255), outline=(244, 114, 182, 130), width=2)

    # Photo placeholder with artistic gradient
    for y in range(cy1, cy1 + 700):
        val = int((y - cy1) / 700 * 255)
        draw.line([(cx1 + 2, y), (cx2 - 2, y)], fill=(60 + int(val * 0.1), 25 + int(val * 0.15), 65 + int(val * 0.2), 255))

    # Top badges on card
    draw.rounded_rectangle([cx1 + 25, cy1 + 25, cx1 + 175, cy1 + 65], radius=20, fill=(244, 63, 94, 230))
    draw.text((cx1 + 100, cy1 + 45), "VERIFIED PRO", fill=(255, 255, 255, 255), anchor="mm", font=get_font(14, bold=True))

    draw.rounded_rectangle([cx2 - 165, cy1 + 25, cx2 - 25, cy1 + 65], radius=20, fill=(20, 8, 26, 200), outline=(244, 114, 182, 100), width=1)
    draw.text((cx2 - 95, cy1 + 45), "SAG-AFTRA", fill=(255, 255, 255, 255), anchor="mm", font=get_font(14, bold=True))

    # Profile info block
    info_y = cy1 + 720
    draw.text((cx1 + 30, info_y), "Elena Rostova, 27", fill=(255, 255, 255, 255), font=get_font(34, bold=True))
    draw.text((cx1 + 30, info_y + 48), "Lead Actor  •  Drama, Sci-Fi", fill=(251, 113, 133, 255), font=get_font(22, bold=True))

    # Hinge quote box
    draw.rounded_rectangle([cx1 + 30, info_y + 100, cx2 - 30, info_y + 200], radius=16, fill=(40, 16, 50, 220), outline=(244, 114, 182, 100), width=1)
    draw.text((cx1 + 48, info_y + 115), "ABOUT ME", fill=(244, 63, 94, 255), font=get_font(13, bold=True))
    draw.text((cx1 + 48, info_y + 145), '"Method actor with 6 feature film credits & combat training."', fill=(241, 245, 249, 255), font=get_font(18, bold=False))

    # Match metrics
    draw.text((cx1 + 30, info_y + 225), "$1,250 / day  •  ★ 4.9 (18 reviews)  •  3.8 mi away", fill=(148, 163, 184, 255), font=get_font(17, bold=False))

    # Floating dock buttons
    dock_y = ph - 130
    # Pass (Rose)
    draw.ellipse([pw // 2 - 170 - 45, dock_y - 45, pw // 2 - 170 + 45, dock_y + 45], fill=(244, 63, 94, 60), outline=(244, 63, 94, 200), width=2)
    draw.text((pw // 2 - 170, dock_y), "✕", fill=(251, 113, 133, 255), anchor="mm", font=get_font(40, bold=True))

    # Direct Offer (Electric Violet)
    draw.ellipse([pw // 2 - 40, dock_y - 40, pw // 2 + 40, dock_y + 40], fill=(192, 132, 252, 60), outline=(192, 132, 252, 200), width=2)
    draw.text((pw // 2, dock_y), "⚡", fill=(192, 132, 252, 255), anchor="mm", font=get_font(34, bold=True))

    # Shortlist (Emerald)
    draw.ellipse([pw // 2 + 170 - 45, dock_y - 45, pw // 2 + 170 + 45, dock_y + 45], fill=(52, 211, 153, 60), outline=(52, 211, 153, 200), width=2)
    draw.text((pw // 2 + 170, dock_y), "♥", fill=(52, 211, 153, 255), anchor="mm", font=get_font(40, bold=True))

# Screen 2: In-App Casting Room & Teleprompter
def render_casting_room(draw, pw, ph):
    draw.text((pw // 2, 85), "SELF-TAPE CASTING ROOM", fill=(255, 255, 255, 255), anchor="mm", font=get_font(28, bold=True))
    draw.text((pw // 2, 120), "Role: Detective Miller  •  Scene 4 Take 2", fill=(244, 63, 94, 255), anchor="mm", font=get_font(17, bold=False))

    # Viewfinder
    vx1, vy1, vx2, vy2 = 40, 160, pw - 40, ph - 220
    draw.rounded_rectangle([vx1, vy1, vx2, vy2], radius=28, fill=(18, 7, 24, 255), outline=(244, 114, 182, 120), width=2)

    # Viewfinder corners
    corner_len = 35
    for (cx, cy, dx, dy) in [(vx1 + 25, vy1 + 25, 1, 1), (vx2 - 25, vy1 + 25, -1, 1), (vx1 + 25, vy2 - 25, 1, -1), (vx2 - 25, vy2 - 25, -1, -1)]:
        draw.line([(cx, cy), (cx + corner_len * dx, cy)], fill=(244, 63, 94, 255), width=3)
        draw.line([(cx, cy), (cx, cy + corner_len * dy)], fill=(244, 63, 94, 255), width=3)

    # Recording badge
    draw.ellipse([vx1 + 40, vy1 + 40, vx1 + 60, vy1 + 60], fill=(239, 68, 68, 255))
    draw.text((vx1 + 75, vy1 + 50), "REC  01:24", fill=(255, 255, 255, 255), anchor="lm", font=get_font(18, bold=True))

    # Teleprompter Overlay Glass Card
    tx1, ty1, tx2, ty2 = vx1 + 30, vy1 + 180, vx2 - 30, vy1 + 460
    draw.rounded_rectangle([tx1, ty1, tx2, ty2], radius=20, fill=(10, 4, 14, 220), outline=(244, 114, 182, 90), width=1)
    draw.text((tx1 + 25, ty1 + 25), "TELEPROMPTER SCRIPT", fill=(244, 63, 94, 255), font=get_font(14, bold=True))
    draw.text((tx1 + 25, ty1 + 60), "MILLER: We don't have forty-eight hours.", fill=(255, 255, 255, 255), font=get_font(20, bold=True))
    draw.text((tx1 + 25, ty1 + 100), "If that convoy leaves the dock tonight,", fill=(226, 232, 240, 255), font=get_font(20, bold=False))
    draw.text((tx1 + 25, ty1 + 140), "the entire operation goes dark.", fill=(226, 232, 240, 255), font=get_font(20, bold=False))
    draw.text((tx1 + 25, ty1 + 195), "Scroll speed: 1.2x  •  Font size: L", fill=(148, 163, 184, 255), font=get_font(14, bold=False))

    # Bottom record button
    by = ph - 120
    draw.ellipse([pw // 2 - 50, by - 50, pw // 2 + 50, by + 50], outline=(255, 255, 255, 255), width=4)
    draw.ellipse([pw // 2 - 40, by - 40, pw // 2 + 40, by + 40], fill=(239, 68, 68, 255))

# Screen 3: Mutual Matches & Casting Board
def render_matches(draw, pw, ph):
    draw.text((pw // 2, 85), "MUTUAL MATCHES", fill=(255, 255, 255, 255), anchor="mm", font=get_font(30, bold=True))
    draw.text((pw // 2, 120), "You and talent both showed interest", fill=(244, 63, 94, 255), anchor="mm", font=get_font(17, bold=False))

    # Horizontal Story Avatars
    sy = 160
    draw.text((45, sy), "New Matches (4)", fill=(255, 255, 255, 255), font=get_font(20, bold=True))

    names = ["Sophia", "Marcus", "Chloe", "David"]
    roles = ["Lead", "Supporting", "Stunt", "DOP"]
    for i in range(4):
        ax = 70 + i * 180
        ay = sy + 90
        # Dual ring gradient
        draw.ellipse([ax - 55, ay - 55, ax + 55, ay + 55], outline=(244, 63, 94, 255), width=4)
        draw.ellipse([ax - 48, ay - 48, ax + 48, ay + 48], fill=(45 + i * 15, 20 + i * 10, 55 + i * 12, 255))
        # Heart indicator
        draw.ellipse([ax + 24, ay + 24, ax + 54, ay + 54], fill=(244, 63, 94, 255), outline=(20, 8, 26, 255), width=2)
        draw.text((ax + 39, ay + 39), "♥", fill=(255, 255, 255, 255), anchor="mm", font=get_font(14, bold=True))
        # Name
        draw.text((ax, ay + 75), names[i], fill=(255, 255, 255, 255), anchor="mm", font=get_font(18, bold=True))
        draw.text((ax, ay + 102), roles[i], fill=(148, 163, 184, 255), anchor="mm", font=get_font(15, bold=False))

    # Matches List Cards
    cy = sy + 250
    draw.text((45, cy), "Casting Board & Offers", fill=(255, 255, 255, 255), font=get_font(22, bold=True))

    cards = [
        ("Sophia Hayes", "Role: Dr. Evelyn Vance • Neo-Noir Thriller", "OFFER SENT • $1,400/day", (244, 63, 94)),
        ("Marcus Vance", "Role: Detective Thorne • The Last Precinct", "MUTUAL MATCH • Callback", (52, 211, 153)),
        ("Chloe Zhao", "Role: Lead Stunt Driver • Fast Horizons", "BOOKED & ESCROW FUNDED", (192, 132, 252)),
    ]

    for i, (name, role, status, col) in enumerate(cards):
        card_y = cy + 50 + i * 210
        draw.rounded_rectangle([40, card_y, pw - 40, card_y + 180], radius=24, fill=(28, 12, 36, 240), outline=(244, 114, 182, 100), width=1)
        # Avatar box
        draw.rounded_rectangle([60, card_y + 25, 170, card_y + 155], radius=18, fill=(50 + i * 20, 20 + i * 10, 60 + i * 15, 255))
        draw.text((115, card_y + 90), name[0], fill=(255, 255, 255, 255), anchor="mm", font=get_font(38, bold=True))
        # Text details
        draw.text((195, card_y + 35), name, fill=(255, 255, 255, 255), font=get_font(24, bold=True))
        draw.text((195, card_y + 75), role, fill=(203, 213, 225, 255), font=get_font(16, bold=False))
        # Status pill
        draw.rounded_rectangle([195, card_y + 115, 470, card_y + 150], radius=14, fill=(col[0], col[1], col[2], 50), outline=(col[0], col[1], col[2], 180), width=1)
        draw.text((205, card_y + 123), status, fill=(col[0], col[1], col[2], 255), font=get_font(13, bold=True))

# Screen 4: Safe Escrow Contracts
def render_escrow(draw, pw, ph):
    draw.text((pw // 2, 85), "ESCROW CONTRACT VAULT", fill=(255, 255, 255, 255), anchor="mm", font=get_font(30, bold=True))
    draw.text((pw // 2, 120), "Protected Milestone Payments & Splits", fill=(244, 63, 94, 255), anchor="mm", font=get_font(17, bold=False))

    # Main Escrow Balance Card
    draw.rounded_rectangle([40, 160, pw - 40, 480], radius=28, fill=(28, 12, 36, 255), outline=(52, 211, 153, 140), width=2)
    draw.text((70, 200), "ACTIVE ESCROW LOCKED", fill=(52, 211, 153, 255), font=get_font(16, bold=True))
    draw.text((70, 240), "$24,500.00", fill=(255, 255, 255, 255), font=get_font(52, bold=True))
    draw.text((70, 315), "Production: Paramount Apex • Project: Shadow Fall", fill=(203, 213, 225, 255), font=get_font(18, bold=False))

    # Progress bar
    draw.rounded_rectangle([70, 370, pw - 70, 386], radius=8, fill=(50, 20, 60, 255))
    draw.rounded_rectangle([70, 370, int((pw - 70) * 0.72), 386], radius=8, fill=(52, 211, 153, 255))
    draw.text((70, 410), "72% Complete  •  Next Release upon Wrap Day 3", fill=(148, 163, 184, 255), font=get_font(16, bold=False))

    # Split breakdown
    draw.text((45, 520), "Contract Split Breakdown", fill=(255, 255, 255, 255), font=get_font(22, bold=True))

    splits = [
        ("Talent Principal (80%)", "$19,600.00", "Direct to Elena Rostova"),
        ("Agency Commission (10%)", "$2,450.00", "Routed to CAA Talent Agency"),
        ("Platform Escrow Fee (10%)", "$2,450.00", "Full Insurance & Contract Protection"),
    ]

    for i, (label, amount, sub) in enumerate(splits):
        sy = 570 + i * 150
        draw.rounded_rectangle([40, sy, pw - 40, sy + 125], radius=20, fill=(24, 10, 32, 220), outline=(244, 114, 182, 80), width=1)
        draw.text((65, sy + 25), label, fill=(255, 255, 255, 255), font=get_font(20, bold=True))
        draw.text((65, sy + 65), sub, fill=(148, 163, 184, 255), font=get_font(15, bold=False))
        draw.text((pw - 65, sy + 35), amount, fill=(52, 211, 153, 255), anchor="rm", font=get_font(24, bold=True))

    # Trust security badge
    draw.rounded_rectangle([40, ph - 220, pw - 40, ph - 100], radius=20, fill=(40, 16, 50, 200), outline=(244, 114, 182, 120), width=1)
    draw.text((pw // 2, ph - 175), "🛡️ Bank-Grade Segregated Escrow", fill=(255, 255, 255, 255), anchor="mm", font=get_font(20, bold=True))
    draw.text((pw // 2, ph - 140), "Funds locked prior to shoot date. Zero chargeback risk.", fill=(203, 213, 225, 255), anchor="mm", font=get_font(15, bold=False))

# Screen 5: Set-Beacon Emergency Calls
def render_beacon(draw, pw, ph):
    draw.text((pw // 2, 85), "SET-BEACON CALLS", fill=(255, 255, 255, 255), anchor="mm", font=get_font(30, bold=True))
    draw.text((pw // 2, 120), "Immediate Same-Day Crew & Actor Replacements", fill=(244, 63, 94, 255), anchor="mm", font=get_font(17, bold=False))

    # Active Emergency Banner
    draw.rounded_rectangle([40, 160, pw - 40, 480], radius=28, fill=(45, 12, 28, 255), outline=(244, 63, 94, 220), width=2)
    # Pulsing beacon circle
    draw.ellipse([pw // 2 - 50, 240 - 50, pw // 2 + 50, 240 + 50], fill=(244, 63, 94, 80), outline=(244, 63, 94, 255), width=3)
    draw.text((pw // 2, 240), "🚨", fill=(255, 255, 255, 255), anchor="mm", font=get_font(44, bold=False))

    draw.text((pw // 2, 330), "URGENT REPLACEMENT NEEDED", fill=(255, 255, 255, 255), anchor="mm", font=get_font(26, bold=True))
    draw.text((pw // 2, 375), "Sound Mixer / Boom Operator  •  Shoot Starts 1:00 PM", fill=(251, 113, 133, 255), anchor="mm", font=get_font(18, bold=True))
    draw.text((pw // 2, 420), "Rate: $950/day (1.5x Emergency Payout)  •  Burbank Studios", fill=(226, 232, 240, 255), anchor="mm", font=get_font(17, bold=False))

    # Action Claim Button
    draw.rounded_rectangle([80, 520, pw - 80, 595], radius=28, fill=(244, 63, 94, 255))
    draw.text((pw // 2, 558), "CLAIM EMERGENCY SET CALL (1 TAP)", fill=(255, 255, 255, 255), anchor="mm", font=get_font(20, bold=True))

    # Radius Settings Card
    draw.text((45, 650), "Your Broadcast Radius", fill=(255, 255, 255, 255), font=get_font(22, bold=True))

    draw.rounded_rectangle([40, 700, pw - 40, 940], radius=24, fill=(28, 12, 36, 240), outline=(244, 114, 182, 90), width=1)
    draw.text((70, 740), "Current Alert Radius: 40 Miles", fill=(255, 255, 255, 255), font=get_font(22, bold=True))
    draw.text((70, 780), "Covers Los Angeles, Burbank, Glendale, Pasadena", fill=(148, 163, 184, 255), font=get_font(16, bold=False))

    # Radius options
    rad_x = 70
    for r in ["15 mi", "25 mi", "40 mi (Active)", "60 mi"]:
        rw = 150
        is_active = "Active" in r
        bg = (244, 63, 94, 200) if is_active else (40, 16, 50, 200)
        draw.rounded_rectangle([rad_x, 830, rad_x + rw, 885], radius=16, fill=bg, outline=(244, 114, 182, 140), width=1)
        draw.text((rad_x + rw // 2, 858), r.split()[0], fill=(255, 255, 255, 255), anchor="mm", font=get_font(16, bold=True))
        rad_x += rw + 15

# -------------------------------------------------------------
# Main Execution
# -------------------------------------------------------------
if __name__ == "__main__":
    print("Generating Google Play Store visual assets...")
    create_app_icon()
    create_feature_graphic()
    create_screenshot(1, "SWIPE TO CAST", "Discover verified actors, models & crew", render_deck)
    create_screenshot(2, "IN-APP CASTING ROOM", "Record self-tapes with built-in teleprompter", render_casting_room)
    create_screenshot(3, "MUTUAL MATCHES", "Real-time casting boards & direct offers", render_matches)
    create_screenshot(4, "SAFE ESCROW PAYMENTS", "Locked milestone deposits & split contracts", render_escrow)
    create_screenshot(5, "SET-BEACON ALERTS", "Same-day emergency crew & talent callouts", render_beacon)
    print("All store assets successfully created in store-assets/")
