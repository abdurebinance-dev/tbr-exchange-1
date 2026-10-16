const API_BASE_URL = window.location.hostname.includes('localhost') ? '' : 'https://tbr-exchange-backend.onrender.com';

let videoStream = null;
const videoElement = document.getElementById('videoElement');
const cameraContainer = document.getElementById('cameraContainer');
const selfieTriggerBox = document.getElementById('selfieTriggerBox');
const selfiePreviewContainer = document.getElementById('selfiePreviewContainer');
const selfiePreviewImg = document.getElementById('selfiePreviewImg');
const canvasElement = document.getElementById('canvasElement');

let frontImageBase64 = null;
let backImageBase64 = null;
let selfieImageBase64 = null;

function showToast(message) {
    let toast = document.getElementById('customToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'customToast';
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; background: #1e2329; color: #fff;
            padding: 14px 22px; border-radius: 8px; border-left: 4px solid #f3ba2f;
            box-shadow: 0 4px 20px rgba(0,0,0,0.7); z-index: 10000; display: flex;
            align-items: center; gap: 12px; border: 1px solid #30363d; transition: opacity 0.3s ease;
        `;
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-check-circle" style="color: #0ecb81; font-size: 18px;"></i><span style="font-size: 14px; font-weight: 500;">${message}</span>`;
    toast.style.display = 'flex';
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 3000);
}

async function compressImage(base64Str) {
    return new Promise((resolve) => {
        if (!base64Str) return resolve('');
        let img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let canvas = document.createElement('canvas');
            let scaleSize = 800 / img.width; 
            if (scaleSize > 1) scaleSize = 1;
            canvas.width = img.width * scaleSize;
            canvas.height = img.height * scaleSize;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.6)); 
        };
    });
}

function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function startCamera() {
    try {
        if (cameraContainer) cameraContainer.style.display = 'block';
        if (selfieTriggerBox) selfieTriggerBox.style.display = 'none';
        if (selfiePreviewContainer) selfiePreviewContainer.style.display = 'none';
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (videoElement) videoElement.srcObject = videoStream;
    } catch (err) {
        alert("Camera access error!");
        stopCamera();
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (cameraContainer) cameraContainer.style.display = 'none';
}

function captureSelfie() {
    if (!videoElement) return;
    const context = canvasElement.getContext('2d');
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    selfieImageBase64 = canvasElement.toDataURL('image/jpeg');
    if (selfiePreviewImg) selfiePreviewImg.src = selfieImageBase64;
    if (selfiePreviewContainer) selfiePreviewContainer.style.display = 'block';
    stopCamera();
}

function retakeSelfie() {
    selfieImageBase64 = null;
    if (selfiePreviewContainer) selfiePreviewContainer.style.display = 'none';
    startCamera();
}

document.addEventListener('DOMContentLoaded', async () => {
    // I-bind ang mga event listener sa halip na gumamit ng in-line onclick
    const frontBox = document.getElementById('frontBox');
    const frontInput = document.getElementById('frontInput');
    const backBox = document.getElementById('backBox');
    const backInput = document.getElementById('backInput');
    
    if (frontBox && frontInput) {
        frontBox.addEventListener('click', () => frontInput.click());
    }
    
    if (backBox && backInput) {
        backBox.addEventListener('click', () => backInput.click());
    }

    const selfieTrigger = document.getElementById('selfieTriggerBox');
    if (selfieTrigger) selfieTrigger.addEventListener('click', startCamera);

    const captureBtn = document.getElementById('captureBtn');
    if (captureBtn) captureBtn.addEventListener('click', captureSelfie);

    const cancelCamBtn = document.getElementById('cancelCamBtn');
    if (cancelCamBtn) cancelCamBtn.addEventListener('click', stopCamera);

    const retakeBtn = document.getElementById('retakeBtn');
    if (retakeBtn) retakeBtn.addEventListener('click', retakeSelfie);

    // Pangangasiwa sa Pagpili ng File
    if (frontInput) {
        frontInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                try {
                    frontImageBase64 = await convertFileToBase64(file);
                    document.getElementById('frontText').innerHTML = '<span style="color: #0ecb81;">Front Uploaded ✓</span>';
                } catch (err) {
                    console.error('Front image conversion error:', err);
                }
            }
        });
    }

    if (backInput) {
        backInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                try {
                    backImageBase64 = await convertFileToBase64(file);
                    document.getElementById('backText').innerHTML = '<span style="color: #0ecb81;">Back Uploaded ✓</span>';
                } catch (err) {
                    console.error('Back image conversion error:', err);
                }
            }
        });
    }

    // Pangangasiwa sa Pag-submit
    const submitReviewBtn = document.getElementById('submitReviewBtn');
    if (submitReviewBtn) {
        submitReviewBtn.addEventListener('click', async () => {
            const email = document.getElementById('emailInput')?.value.trim() || '';
            const fullName = document.getElementById('fullNameInput')?.value.trim() || '';
            const idNumber = document.getElementById('idNumberInput')?.value.trim() || '';
            const dob = document.getElementById('dobInput')?.value || '';
            const address = document.getElementById('addressInput')?.value.trim() || '';
            const docType = document.getElementById('docTypeInput')?.value || '';

            if (!email) {
                alert('Please enter your Email!');
                document.getElementById('emailInput')?.focus();
                return;
            }
            if (!fullName) {
                alert('Please enter your full name!');
                return;
            }
            if (!frontImageBase64 || !selfieImageBase64) {
                alert('Please upload the front of your ID and a selfie!');
                return;
            }

            submitReviewBtn.disabled = true;
            submitReviewBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

            const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');

            try {
                const smallFrontImage = await compressImage(frontImageBase64); 
                const smallBackImage = await compressImage(backImageBase64);
                const smallSelfieImage = await compressImage(selfieImageBase64);

                const response = await fetch(`${API_BASE_URL}/api/kyc/submit`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        email: email,
                        fullName: fullName,
                        idNumber: idNumber,
                        dateOfBirth: dob,
                        residentialAddress: address,
                        docType: docType,
                        frontImage: smallFrontImage,
                        backImage: smallBackImage,
                        selfieImage: smallSelfieImage
                    })
                });

                const result = await response.json();
                
                if (response.ok && result.success) {
                    showToast("KYC successfully submitted for review!");
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500); 
                } else {
                    alert(result.message || 'Error submitting KYC.');
                    submitReviewBtn.disabled = false;
                    submitReviewBtn.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket"></i> Submit for Review';
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Network or server error.');
                submitReviewBtn.disabled = false;
                submitReviewBtn.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket"></i> Submit for Review';
            }
        });
    }

    // Data sa Profile ng User
    const savedEmail = localStorage.getItem('userEmail') || localStorage.getItem('email') || '';
    if (document.getElementById('emailInput')) {
        document.getElementById('emailInput').value = savedEmail;
    }

    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');
    if (token) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success && data.user) {
                if (data.user.email && document.getElementById('emailInput')) {
                    document.getElementById('emailInput').value = data.user.email;
                }

                const status = data.user.kycStatus || 'unverified';
                const statusText = document.getElementById('statusText');
                const statusDot = document.getElementById('statusDot');

                if (statusText && statusDot) {
                    statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                    if (status === 'approved' || status === 'verified') {
                        statusDot.style.color = '#0ecb81';
                    } else if (status === 'pending') {
                        statusDot.style.color = '#f0b90b';
                    } else if (status === 'rejected') {
                        statusDot.style.color = '#f6465d';
                    } else {
                        statusDot.style.color = '#848e9c';
                    }
                }
            }
        } catch (e) {
            console.error('Profile fetch error', e);
        }
    }
});