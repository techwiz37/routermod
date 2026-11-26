import sharp from "sharp";
import jsQR from "jsqr";
import QRCode from "qrcode";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";

// Modern phone cameras produce 48 MP photos. Anything larger is downscaled
// before decoding, so a generous pixel cap is safe and avoids false failures.
const MAX_INPUT_PIXELS = 60_000_000;
const DECODE_SIDE = 1600;
const NATIVE_PIXELS = 4_000_000;

const zxingHints = new Map();
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
zxingHints.set(DecodeHintType.TRY_HARDER, true);
zxingHints.set(DecodeHintType.ALSO_INVERTED, true);

function decodeWithZxing(gray, width, height) {
  try {
    const source = new RGBLuminanceSource(gray, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const reader = new MultiFormatReader();
    reader.setHints(zxingHints);
    return reader.decode(bitmap, zxingHints)?.getText?.() || null;
  } catch {
    return null;
  }
}

// jsQR expects an RGBA buffer; sharp gives us one grayscale byte per pixel.
function grayToRgba(gray) {
  const rgba = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i];
    const offset = i * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function decodeGray(gray, width, height) {
  const pixels = new Uint8ClampedArray(gray.buffer, gray.byteOffset, gray.byteLength);
  const js = jsQR(grayToRgba(pixels), width, height, { inversionAttempts: "attemptBoth" });
  if (js?.data) return js.data;
  return decodeWithZxing(pixels, width, height);
}

async function decodeVariant(buffer, { maxSide, threshold, sharpen }) {
  let pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .flatten({ background: "#ffffff" })
    .greyscale();
  if (maxSide) {
    pipeline = pipeline.resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: false,
    });
  }
  if (sharpen) pipeline = pipeline.normalize().sharpen();
  if (threshold) pipeline = pipeline.threshold(threshold, { grayscale: true });
  const image = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return decodeGray(image.data, image.info.width, image.info.height);
}

/**
 * Decode a QR code from an uploaded image. Screenshots are usually crisp but
 * merchant QRIS images often carry a centre logo, rounded modules, or a phone
 * photo's perspective. The image is therefore tried at native resolution, a
 * capped/upscaled size, and a few threshold/sharpen variants. ZXing runs as a
 * fallback for codes jsQR cannot read. Returns the decoded string or null.
 */
export async function decodeQrFromImage(buffer) {
  if (!buffer?.length) return null;

  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    return null;
  }
  if (!meta?.width || !meta?.height) return null;

  const attempts = [];
  if (meta.width * meta.height <= NATIVE_PIXELS) {
    attempts.push({ maxSide: 0 });
  }
  attempts.push({ maxSide: DECODE_SIDE });
  attempts.push({ maxSide: DECODE_SIDE, threshold: 128 });
  attempts.push({ maxSide: DECODE_SIDE, threshold: 168 });
  attempts.push({ maxSide: DECODE_SIDE, threshold: 200 });
  attempts.push({ maxSide: DECODE_SIDE, sharpen: true });

  for (const attempt of attempts) {
    try {
      const decoded = await decodeVariant(buffer, attempt);
      if (decoded) return decoded;
    } catch {
      // One failed preprocessing pass must not abort the remaining attempts.
    }
  }
  return null;
}

export async function renderQrDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 720,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}
