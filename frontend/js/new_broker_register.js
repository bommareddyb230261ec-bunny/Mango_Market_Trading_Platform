// =====================================================
// TRADE LICENSE FILE UPLOAD - BROKER REGISTRATION
// =====================================================

const licenseUploadArea = document.getElementById('licenseUploadArea');
const tradeLicenseFile = document.getElementById('tradeLicenseFile');
const uploadText = document.getElementById('uploadText');
const fileSelectedText = document.getElementById('fileSelectedText');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

// Click to upload
licenseUploadArea.addEventListener('click', () => {
    tradeLicenseFile.click();
});

// File selection from input
tradeLicenseFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        validateAndSelectFile(file);
    }
});

// Drag and drop
licenseUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    licenseUploadArea.style.background = '#fff1eb';
    licenseUploadArea.style.borderColor = '#bf360c';
});

licenseUploadArea.addEventListener('dragleave', () => {
    licenseUploadArea.style.background = '#fef5f0';
    licenseUploadArea.style.borderColor = '#e65100';
});

licenseUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    licenseUploadArea.style.background = '#fef5f0';
    licenseUploadArea.style.borderColor = '#e65100';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        validateAndSelectFile(files[0]);
    }
});

function validateAndSelectFile(file) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        alert(`File is too large. Maximum size is 5MB (yours is ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        tradeLicenseFile.value = '';
        return;
    }

    // Validate file extension
    const extension = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
        alert('Invalid file type. Only PDF, JPG, and PNG files are allowed.');
        tradeLicenseFile.value = '';
        return;
    }

    // File is valid - show confirmation
    uploadText.textContent = '✓ File selected';
    uploadText.style.color = '#10b981';
    fileSelectedText.style.display = 'block';
    fileSelectedText.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
}

// Override the default form submission to include file upload
const brokerRegisterForm = document.getElementById('brokerRegisterForm');
if (brokerRegisterForm) {
    // Store the file input element reference
    brokerRegisterForm.tradeLicenseFile = tradeLicenseFile;
}
