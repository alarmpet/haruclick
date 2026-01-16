// Simple module to hold OCR preprocessing flag
let preprocessEnabled = true;

export function isPreprocessEnabled() {
    return preprocessEnabled;
}

export function setPreprocessEnabled(value: boolean) {
    preprocessEnabled = value;
}
