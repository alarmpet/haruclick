// Simple module to hold OCR preprocessing flag
// Now controls the Advanced Pipeline (Deskew, ROI, Smart Resize)
let preprocessEnabled = true;

export function isPreprocessEnabled() {
    return preprocessEnabled;
}

export function setPreprocessEnabled(value: boolean) {
    preprocessEnabled = value;
}
