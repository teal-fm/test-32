use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use anyhow::Result;
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgba, RgbaImage};
use imageproc::drawing::draw_text_mut;
use std::io::Cursor;
use tracing;

/// Generate an OG image for a user's wrapped page
pub async fn generate_og_image(
    handle: &str,
    year: u32,
    profile_picture_url: Option<&str>,
    top_artist_image_url: Option<&str>,
) -> Result<Vec<u8>> {
    // OG image dimensions (1200x630 is the recommended size)
    const WIDTH: u32 = 1200;
    const HEIGHT: u32 = 630;

    // Create base image with dark background
    let mut img: RgbaImage = ImageBuffer::from_pixel(WIDTH, HEIGHT, Rgba([10, 10, 10, 255]));

    // Fetch and blur the top artist image for background
    if let Some(artist_url) = top_artist_image_url {
        tracing::info!("fetching artist background image from URL: '{}'", artist_url);
        match fetch_image(artist_url).await {
            Ok(artist_img) => {
                tracing::info!("successfully fetched artist image, applying blur");
                // Resize to cover the canvas
                let resized = resize_to_cover(&artist_img, WIDTH, HEIGHT);
                // Apply heavy blur for background effect
                let blurred = image::imageops::blur(&resized, 30.0);
                // Darken the blurred image
                let darkened = darken_image(&blurred, 0.4);
                // Composite onto base
                image::imageops::overlay(&mut img, &darkened, 0, 0);
            }
            Err(e) => {
                tracing::warn!("failed to fetch artist image: {}", e);
            }
        }
    } else {
        tracing::info!("no top artist image URL provided for OG background");
    }

    // Add a gradient overlay for better text readability
    add_gradient_overlay(&mut img);

    // Load font - use DM Sans Bold
    let font_data = include_bytes!("../../public/fonts/DMSans-Bold.ttf");
    let font = FontRef::try_from_slice(font_data).expect("Failed to load DM Sans font");

    // Draw profile picture if available
    let profile_x = WIDTH / 2;
    let profile_y = 180;
    let profile_size = 140;

    if let Some(pfp_url) = profile_picture_url {
        if let Ok(pfp_img) = fetch_image(pfp_url).await {
            let pfp_resized = pfp_img.resize_exact(
                profile_size,
                profile_size,
                image::imageops::FilterType::Lanczos3,
            );
            // Create circular mask
            let circular_pfp = make_circular(&pfp_resized.to_rgba8());
            // Draw centered
            let x = (profile_x - profile_size / 2) as i64;
            let y = (profile_y - profile_size / 2) as i64;
            image::imageops::overlay(&mut img, &circular_pfp, x, y);
        }
    } else {
        // Draw a placeholder circle
        draw_placeholder_avatar(&mut img, profile_x as i32, profile_y as i32, profile_size / 2);
    }

    // Draw the handle text
    let handle_text = format!("@{}", handle);
    let handle_scale = PxScale::from(52.0);
    let handle_width = text_width(&font, &handle_text, handle_scale);
    draw_text_mut(
        &mut img,
        Rgba([255, 255, 255, 255]),
        (WIDTH / 2 - handle_width / 2) as i32,
        270,
        handle_scale,
        &font,
        &handle_text,
    );

    // Draw main title with dynamic year
    let title_text = format!("{} Teal.fm", year);
    let title_scale = PxScale::from(90.0);
    let title_width = text_width(&font, &title_text, title_scale);
    draw_text_mut(
        &mut img,
        Rgba([0, 217, 170, 255]), // Teal color #00d9aa
        (WIDTH / 2 - title_width / 2) as i32,
        340,
        title_scale,
        &font,
        &title_text,
    );

    // Draw subtitle "Year In Music"
    let subtitle_text = "Year In Music";
    let subtitle_scale = PxScale::from(64.0);
    let subtitle_width = text_width(&font, subtitle_text, subtitle_scale);
    draw_text_mut(
        &mut img,
        Rgba([255, 255, 255, 220]),
        (WIDTH / 2 - subtitle_width / 2) as i32,
        440,
        subtitle_scale,
        &font,
        subtitle_text,
    );

    // Encode as PNG
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, image::ImageFormat::Png)?;

    Ok(buffer)
}

async fn fetch_image(url: &str) -> Result<DynamicImage> {
    tracing::debug!("fetch_image called with URL: {}", url);
    
    // Check if this is a local path (starts with /images/)
    if url.starts_with("/images/") {
        // Read directly from filesystem
        let file_path = format!(".{}", url); // Convert /images/... to ./images/...
        tracing::debug!("reading local image from: {}", file_path);
        
        let bytes = tokio::fs::read(&file_path).await.map_err(|e| {
            tracing::error!("failed to read local image {}: {}", file_path, e);
            anyhow::anyhow!("file read error: {}", e)
        })?;
        
        let img = image::load_from_memory(&bytes).map_err(|e| {
            tracing::error!("failed to decode local image: {}", e);
            anyhow::anyhow!("image decode error: {}", e)
        })?;
        
        tracing::info!("successfully loaded local image: {}", file_path);
        return Ok(img);
    }
    
    // Otherwise, fetch from URL
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| {
            tracing::error!("failed to build reqwest client: {}", e);
            anyhow::anyhow!("client build error: {}", e)
        })?;
    
    let response = client
        .get(url)
        .header("User-Agent", "TealWrapped/1.0")
        .send()
        .await
        .map_err(|e| {
            tracing::error!("failed to send request to {}: {}", url, e);
            anyhow::anyhow!("request error: {}", e)
        })?;
    
    if !response.status().is_success() {
        tracing::warn!("image request returned status {}: {}", response.status(), url);
        return Err(anyhow::anyhow!("HTTP {}", response.status()));
    }
    
    let bytes = response.bytes().await.map_err(|e| {
        tracing::error!("failed to read response bytes: {}", e);
        anyhow::anyhow!("read error: {}", e)
    })?;
    
    tracing::debug!("received {} bytes from {}", bytes.len(), url);
    
    let img = image::load_from_memory(&bytes).map_err(|e| {
        tracing::error!("failed to decode image: {}", e);
        anyhow::anyhow!("image decode error: {}", e)
    })?;
    
    Ok(img)
}

fn resize_to_cover(img: &DynamicImage, target_width: u32, target_height: u32) -> RgbaImage {
    let (img_width, img_height) = img.dimensions();
    let img_aspect = img_width as f32 / img_height as f32;
    let target_aspect = target_width as f32 / target_height as f32;

    let (new_width, new_height) = if img_aspect > target_aspect {
        // Image is wider, fit by height
        let new_height = target_height;
        let new_width = (new_height as f32 * img_aspect) as u32;
        (new_width, new_height)
    } else {
        // Image is taller, fit by width
        let new_width = target_width;
        let new_height = (new_width as f32 / img_aspect) as u32;
        (new_width, new_height)
    };

    let resized = img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3);

    // Crop to center
    let x_offset = (new_width.saturating_sub(target_width)) / 2;
    let y_offset = (new_height.saturating_sub(target_height)) / 2;

    image::imageops::crop_imm(&resized.to_rgba8(), x_offset, y_offset, target_width, target_height)
        .to_image()
}

fn darken_image(img: &RgbaImage, factor: f32) -> RgbaImage {
    let mut result = img.clone();
    for pixel in result.pixels_mut() {
        pixel[0] = (pixel[0] as f32 * factor) as u8;
        pixel[1] = (pixel[1] as f32 * factor) as u8;
        pixel[2] = (pixel[2] as f32 * factor) as u8;
    }
    result
}

fn add_gradient_overlay(img: &mut RgbaImage) {
    let (width, height) = img.dimensions();
    for y in 0..height {
        for x in 0..width {
            let pixel = img.get_pixel_mut(x, y);
            // Add a subtle vignette effect
            let center_x = width as f32 / 2.0;
            let center_y = height as f32 / 2.0;
            let dx = (x as f32 - center_x) / center_x;
            let dy = (y as f32 - center_y) / center_y;
            let distance = (dx * dx + dy * dy).sqrt();
            let vignette = (1.0 - distance * 0.4).max(0.6);

            pixel[0] = (pixel[0] as f32 * vignette) as u8;
            pixel[1] = (pixel[1] as f32 * vignette) as u8;
            pixel[2] = (pixel[2] as f32 * vignette) as u8;
        }
    }
}

fn make_circular(img: &RgbaImage) -> RgbaImage {
    let (width, height) = img.dimensions();
    let mut result = RgbaImage::new(width, height);
    let center_x = width as f32 / 2.0;
    let center_y = height as f32 / 2.0;
    let radius = width.min(height) as f32 / 2.0;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - center_x;
            let dy = y as f32 - center_y;
            let distance = (dx * dx + dy * dy).sqrt();

            if distance <= radius {
                // Inside circle - copy pixel
                let pixel = img.get_pixel(x, y);
                result.put_pixel(x, y, *pixel);
            } else if distance <= radius + 2.0 {
                // Anti-aliasing at edge
                let alpha = ((radius + 2.0 - distance) / 2.0 * 255.0) as u8;
                let pixel = img.get_pixel(x, y);
                result.put_pixel(x, y, Rgba([pixel[0], pixel[1], pixel[2], alpha]));
            }
            // Outside circle - leave transparent (default)
        }
    }

    // Add a white border
    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - center_x;
            let dy = y as f32 - center_y;
            let distance = (dx * dx + dy * dy).sqrt();

            if distance >= radius - 3.0 && distance <= radius {
                let pixel = result.get_pixel_mut(x, y);
                // Blend white border
                let border_alpha = 0.5;
                pixel[0] = ((pixel[0] as f32 * (1.0 - border_alpha)) + (255.0 * border_alpha)) as u8;
                pixel[1] = ((pixel[1] as f32 * (1.0 - border_alpha)) + (255.0 * border_alpha)) as u8;
                pixel[2] = ((pixel[2] as f32 * (1.0 - border_alpha)) + (255.0 * border_alpha)) as u8;
            }
        }
    }

    result
}

fn draw_placeholder_avatar(img: &mut RgbaImage, cx: i32, cy: i32, radius: u32) {
    let r = radius as i32;
    for y in (cy - r)..=(cy + r) {
        for x in (cx - r)..=(cx + r) {
            if x >= 0 && y >= 0 && (x as u32) < img.width() && (y as u32) < img.height() {
                let dx = x - cx;
                let dy = y - cy;
                let dist_sq = dx * dx + dy * dy;
                if dist_sq <= (r * r) {
                    let pixel = img.get_pixel_mut(x as u32, y as u32);
                    *pixel = Rgba([60, 60, 80, 255]);
                }
            }
        }
    }
}

fn text_width(font: &FontRef, text: &str, scale: PxScale) -> u32 {
    let scaled = font.as_scaled(scale);
    let mut width = 0.0;
    for c in text.chars() {
        let glyph_id = font.glyph_id(c);
        width += scaled.h_advance(glyph_id);
    }
    width as u32
}

