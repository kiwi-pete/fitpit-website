/* ============================================
   FitPit ZNZ — Interactive Functionality
   ============================================ */

// First-party, cookie-free analytics (self-contained; never tracks
// the admin dashboard, bots or crawlers). See analytics-client.js.
import './analytics-client.js';

// ---------- Mobile Navigation ----------
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.getElementById('nav-links');
const header = document.getElementById('header');

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.classList.toggle('active');
  menuToggle.setAttribute('aria-expanded', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

// Close mobile nav when clicking a link
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle.classList.remove('active');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });
});

// ---------- Sticky Header ----------
let lastScrollY = 0;
let ticking = false;

function updateHeader() {
  const scrollY = window.scrollY;

  if (scrollY > 60) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }

  lastScrollY = scrollY;
  ticking = false;
}

window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(updateHeader);
    ticking = true;
  }
}, { passive: true });

// ---------- Active Navigation Highlighting ----------
const sections = document.querySelectorAll('section[id]');
const navItems = navLinks.querySelectorAll('a[href^="#"]');

function highlightNav() {
  const scrollY = window.scrollY + window.innerHeight / 3;

  sections.forEach(section => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute('id');

    if (scrollY >= top && scrollY < top + height) {
      navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('href') === `#${id}`) {
          item.classList.add('active');
        }
      });
    }
  });
}

window.addEventListener('scroll', () => {
  requestAnimationFrame(highlightNav);
}, { passive: true });

// ---------- Scroll Reveal Animations ----------
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));

// ---------- Smooth Scroll for Anchor Links ----------
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;

    const target = document.querySelector(targetId);
    if (!target) return;

    e.preventDefault();

    const headerHeight = header.offsetHeight;
    const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth'
    });
  });
});

// ---------- Initial state ----------
updateHeader();
highlightNav();

// ---------- Accordion ----------
const accordionTriggers = document.querySelectorAll('.accordion-trigger');

accordionTriggers.forEach(trigger => {
  trigger.addEventListener('click', () => {
    const item = trigger.parentElement;
    const isOpen = item.classList.contains('open');
    const panel = item.querySelector('.accordion-panel');

    // Close all other items
    document.querySelectorAll('.accordion-item').forEach(otherItem => {
      if (otherItem !== item) {
        otherItem.classList.remove('open');
        const otherPanel = otherItem.querySelector('.accordion-panel');
        const otherTrigger = otherItem.querySelector('.accordion-trigger');
        if (otherPanel) otherPanel.style.maxHeight = null;
        if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    // Toggle current item
    if (isOpen) {
      item.classList.remove('open');
      panel.style.maxHeight = null;
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      item.classList.add('open');
      panel.style.maxHeight = panel.scrollHeight + 'px';
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
});

// Set initial open accordion panel height
document.querySelectorAll('.accordion-item.open').forEach(item => {
  const panel = item.querySelector('.accordion-panel');
  if (panel) panel.style.maxHeight = panel.scrollHeight + 'px';
});

// ---------- Medical Clinic Modal Triggers ----------
const clinicModal = document.getElementById('clinic-modal');
const openClinicBtn = document.getElementById('open-clinic-modal');
const closeClinicBtn = document.getElementById('close-clinic-modal');

if (clinicModal && openClinicBtn && closeClinicBtn) {
  openClinicBtn.addEventListener('click', () => {
    clinicModal.showModal();
    document.body.style.overflow = 'hidden'; // prevent background scrolling
  });

  const closeModal = () => {
    clinicModal.close();
    document.body.style.overflow = ''; // restore scrolling
  };

  closeClinicBtn.addEventListener('click', closeModal);

  // Close modal when clicking on the backdrop
  clinicModal.addEventListener('click', (e) => {
    if (e.target === clinicModal) {
      closeModal();
    }
  });
}

// ---------- Daily Pass Modal Triggers ----------
const dailyPassModal = document.getElementById('daily-pass-modal');
const openDailyPassBtn = document.getElementById('open-daily-pass-modal');
const closeDailyPassBtn = document.getElementById('close-daily-pass-modal');
const modalViewContactBtn = document.getElementById('modal-view-contact-info');

if (dailyPassModal && openDailyPassBtn && closeDailyPassBtn) {
  openDailyPassBtn.addEventListener('click', () => {
    dailyPassModal.showModal();
    document.body.style.overflow = 'hidden'; // prevent background scrolling
  });

  const closeDailyPassModal = () => {
    dailyPassModal.close();
    document.body.style.overflow = ''; // restore scrolling
  };

  closeDailyPassBtn.addEventListener('click', closeDailyPassModal);

  // Close modal when clicking on the backdrop
  dailyPassModal.addEventListener('click', (e) => {
    const dialogDimensions = dailyPassModal.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      closeDailyPassModal();
    }
  });

  // Handle "View Location & Hours Details" button click
  if (modalViewContactBtn) {
    modalViewContactBtn.addEventListener('click', () => {
      closeDailyPassModal();
      
      const target = document.getElementById('contact');
      if (target) {
        // Calculate position based on header offset
        const headerHeight = header ? header.offsetHeight : 80;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  }
}

/* ==================== Membership Agreement Wizard Controller & Homepage Form ==================== */

// --- Generic Signature Pad Class/Initializer ---
function initSignaturePad(canvasEl, clearBtnEl, errorMsgEl) {
  if (!canvasEl) return null;
  const ctx = canvasEl.getContext('2d');
  let isCanvasBlank = true;
  let isDrawing = false;

  const resizeCanvas = () => {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Use the active theme's accent colour for the signature stroke
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-accent').trim() || '#8B7BF7';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Clear canvas content and reset blank state on resize
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    isCanvasBlank = true;
  };

  const getPointerPos = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    if (canvasEl.disabled || canvasEl.closest('.locked')) return;
    isDrawing = true;
    const pos = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isCanvasBlank = false;
    if (errorMsgEl) errorMsgEl.textContent = '';
    const group = canvasEl.closest('.form-group') || canvasEl.parentElement;
    group.classList.remove('invalid');
    e.preventDefault();
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  };

  const stopDrawing = () => {
    isDrawing = false;
  };

  // Event Listeners
  canvasEl.addEventListener('mousedown', startDrawing);
  canvasEl.addEventListener('mousemove', draw);
  canvasEl.addEventListener('mouseup', stopDrawing);
  canvasEl.addEventListener('mouseleave', stopDrawing);
  
  canvasEl.addEventListener('touchstart', startDrawing, { passive: false });
  canvasEl.addEventListener('touchmove', draw, { passive: false });
  canvasEl.addEventListener('touchend', stopDrawing);
  canvasEl.addEventListener('touchcancel', stopDrawing);

  if (clearBtnEl) {
    clearBtnEl.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      isCanvasBlank = true;
    });
  }

  // Initial resize
  resizeCanvas();
  // Listen for resize
  window.addEventListener('resize', resizeCanvas);

  return {
    canvas: canvasEl,
    ctx,
    resize: resizeCanvas,
    clear: () => {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      isCanvasBlank = true;
    },
    isBlank: () => isCanvasBlank,
    setBlank: (val) => { isCanvasBlank = val; },
    getDataURL: () => canvasEl.toDataURL('image/png')
  };
}

// --- Wizard Modal Elements ---
const agreementModal = document.getElementById('agreement-modal');
const closeAgreementBtn = document.getElementById('close-agreement-modal');
const joinBtns = document.querySelectorAll('.join-btn');

const wizardForm = document.getElementById('agreement-form');
const wizardSteps = document.querySelectorAll('.wizard-step');
const stepNodes = document.querySelectorAll('.step-node');
const progressBar = document.getElementById('wizard-progress-bar');
const btnBack = document.getElementById('btn-wizard-back');
const btnNext = document.getElementById('btn-wizard-next');
const wizardFooter = document.getElementById('wizard-footer');

const termSelect = document.getElementById('wizard-membership-term');
const startDateInput = document.getElementById('wizard-start-date');
const signingDateInput = document.getElementById('wizard-signing-date');

// Wizard File Upload
const fileInput = document.getElementById('wizard-id-file');
const dropZone = document.getElementById('id-drop-zone');
const previewContainer = document.getElementById('file-preview-container');
const previewFileName = document.getElementById('preview-file-name');
const previewFileSize = document.getElementById('preview-file-size');
const btnRemoveFile = document.getElementById('btn-remove-file');
const idErrorMsg = document.getElementById('id-error-msg');
let uploadedFileBase64 = null;
let uploadedFileName = '';
let uploadedFileType = '';

// Wizard Signature
const wizardCanvas = document.getElementById('signature-canvas');
const wizardClearBtn = document.getElementById('btn-clear-sig');
const wizardSigErrorMsg = document.getElementById('signature-error-msg');
const wizardTabDraw = document.getElementById('wizard-tab-draw');
const wizardTabType = document.getElementById('wizard-tab-type');
const wizardPanelDraw = document.getElementById('wizard-panel-draw');
const wizardPanelType = document.getElementById('wizard-panel-type');
const wizardTypedSigInput = document.getElementById('signature-typed');
let wizardSigPad = null;
let wizardSigMode = 'draw';
let currentStep = 1;
const totalSteps = 4;

// --- Homepage Agreement Form Elements ---
const homepageForm = document.getElementById('homepage-agreement-form');
const homepagePolicyBox = document.getElementById('homepage-policy-box');
const homepageScrollAlert = document.getElementById('homepage-scroll-alert');
const homepageStartDateInput = document.getElementById('homepage-start-date');
const homepageSigningDateInput = document.getElementById('homepage-signing-date');

// Homepage File Upload
const homepageFileInput = document.getElementById('homepage-id-file');
const homepageDropZone = document.getElementById('homepage-id-drop-zone');
const homepagePreviewContainer = document.getElementById('homepage-file-preview-container');
const homepagePreviewFileName = document.getElementById('homepage-preview-file-name');
const homepagePreviewFileSize = document.getElementById('homepage-preview-file-size');
const homepageBtnRemoveFile = document.getElementById('homepage-btn-remove-file');
const homepageIdErrorMsg = document.getElementById('homepage-id-error-msg');
let homepageUploadedFileBase64 = null;
let homepageUploadedFileName = '';
let homepageUploadedFileType = '';

// Homepage Signature
const homepageCanvas = document.getElementById('homepage-signature-canvas');
const homepageClearBtn = document.getElementById('homepage-btn-clear-sig');
const homepageSigErrorMsg = document.getElementById('homepage-signature-error-msg');
const homepageTabDraw = document.getElementById('homepage-tab-draw');
const homepageTabType = document.getElementById('homepage-tab-type');
const homepagePanelDraw = document.getElementById('homepage-panel-draw');
const homepagePanelType = document.getElementById('homepage-panel-type');
const homepageTypedSigInput = document.getElementById('homepage-signature-typed');
let homepageSigPad = null;
let homepageSigMode = 'draw';

// --- Shared Helpers ---
const setDatesForElement = (startInput, signingInput) => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  
  if (startInput) {
    startInput.value = todayStr;
    startInput.min = todayStr;
  }
  
  if (signingInput) {
    const options = { day: '2-digit', month: 'long', year: 'numeric' };
    signingInput.value = today.toLocaleDateString('en-US', options);
  }
};

// --- Initialize Canvases if elements exist ---
document.addEventListener('DOMContentLoaded', () => {
  if (wizardCanvas) {
    wizardSigPad = initSignaturePad(wizardCanvas, wizardClearBtn, wizardSigErrorMsg);
  }
  if (homepageCanvas) {
    homepageSigPad = initSignaturePad(homepageCanvas, homepageClearBtn, homepageSigErrorMsg);
  }
  setDatesForElement(homepageStartDateInput, homepageSigningDateInput);
});

// Fallback in case DOMContentLoaded has already fired
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  if (wizardCanvas && !wizardSigPad) {
    wizardSigPad = initSignaturePad(wizardCanvas, wizardClearBtn, wizardSigErrorMsg);
  }
  if (homepageCanvas && !homepageSigPad) {
    homepageSigPad = initSignaturePad(homepageCanvas, homepageClearBtn, homepageSigErrorMsg);
  }
  setDatesForElement(homepageStartDateInput, homepageSigningDateInput);
}

// --- Wizard Modal Handlers ---
if (agreementModal) {
  // Reset Wizard State
  const resetWizard = () => {
    currentStep = 1;
    goToStep(1);
    
    // Reset form fields
    wizardForm.reset();
    document.querySelectorAll('#agreement-form .form-group.invalid').forEach(el => el.classList.remove('invalid'));
    document.querySelectorAll('#agreement-form .drag-drop-zone.invalid').forEach(el => el.classList.remove('invalid'));
    document.querySelectorAll('#agreement-form .error-msg').forEach(el => el.textContent = '');
    
    // Reset ID Upload
    uploadedFileBase64 = null;
    uploadedFileName = '';
    uploadedFileType = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (dropZone) {
      dropZone.style.display = 'block';
      dropZone.classList.remove('dragover');
    }
    if (idErrorMsg) idErrorMsg.textContent = '';
    
    // Reset Signature
    if (wizardSigPad) {
      wizardSigPad.clear();
    }
    if (wizardSigErrorMsg) wizardSigErrorMsg.textContent = '';
    selectSigTab('draw');
    
    // Reset Status Screens
    document.getElementById('wizard-status-loading').style.display = 'flex';
    document.getElementById('wizard-status-success').style.display = 'none';
    document.getElementById('wizard-status-error').style.display = 'none';
    wizardFooter.style.display = 'flex';

    // Lock signature area again on reset
    const wizardLockedContainer = document.getElementById('wizard-locked-sig-container');
    const wizardScrollAlert = document.getElementById('wizard-scroll-alert');
    const wizardPolicyBox = document.getElementById('wizard-policy-box');

    if (wizardLockedContainer) {
      wizardLockedContainer.classList.add('locked');
      const disabledElements = wizardLockedContainer.querySelectorAll('input, button');
      disabledElements.forEach(el => el.setAttribute('disabled', ''));
    }
    if (wizardScrollAlert) {
      wizardScrollAlert.style.display = 'flex';
    }
    if (wizardPolicyBox) {
      wizardPolicyBox.scrollTop = 0;
    }
  };

  // Open Modal
  joinBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      resetWizard();
      setDatesForElement(startDateInput, signingDateInput);
      
      const selectedPass = btn.getAttribute('data-pass');
      if (selectedPass && termSelect) {
        const parts = selectedPass.toLowerCase().split(' ');
        const num = parts[0];
        const unit = parts[1];
        
        for (let i = 0; i < termSelect.options.length; i++) {
          const optValue = termSelect.options[i].value.toLowerCase();
          if (optValue === selectedPass.toLowerCase() || (num && unit && optValue.includes(num) && optValue.includes(unit))) {
            termSelect.selectedIndex = i;
            break;
          }
        }
      }
      
      agreementModal.showModal();
      document.body.style.overflow = 'hidden';
      
      setTimeout(() => {
        if (wizardSigPad) wizardSigPad.resize();
      }, 100);
    });
  });

  const closeAgreementModal = () => {
    agreementModal.close();
    document.body.style.overflow = '';
  };

  closeAgreementBtn.addEventListener('click', closeAgreementModal);

  agreementModal.addEventListener('click', (e) => {
    if (e.target === agreementModal) {
      closeAgreementModal();
    }
  });

  // Wizard Navigation
  const goToStep = (step) => {
    currentStep = step;
    
    wizardSteps.forEach(s => {
      const stepNum = parseInt(s.getAttribute('data-step'));
      s.classList.toggle('active', stepNum === step);
    });
    
    stepNodes.forEach(node => {
      const stepNum = parseInt(node.getAttribute('data-step'));
      node.classList.toggle('active', stepNum === step);
      node.classList.toggle('completed', stepNum < step);
    });
    
    const percent = ((step - 1) / (totalSteps - 1)) * 100;
    if (progressBar) progressBar.style.width = `${percent}%`;
    
    if (btnBack) {
      btnBack.style.visibility = step === 1 || step === 5 ? 'hidden' : 'visible';
    }
    if (btnNext) {
      btnNext.textContent = step === totalSteps ? 'Submit Agreement' : 'Next';
    }
  };

  btnBack.addEventListener('click', () => {
    if (currentStep > 1 && currentStep <= totalSteps) {
      goToStep(currentStep - 1);
    }
  });

  btnNext.addEventListener('click', () => {
    if (currentStep < totalSteps) {
      if (validateStep(currentStep)) {
        goToStep(currentStep + 1);
      }
    } else if (currentStep === totalSteps) {
      if (validateStep(currentStep)) {
        submitWizardForm();
      }
    }
  });

  const closeSuccessBtn = document.getElementById('btn-wizard-close-success');
  if (closeSuccessBtn) {
    closeSuccessBtn.addEventListener('click', closeAgreementModal);
  }

  const retryBtn = document.getElementById('btn-wizard-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      goToStep(totalSteps);
      document.getElementById('wizard-status-loading').style.display = 'flex';
      document.getElementById('wizard-status-error').style.display = 'none';
      wizardFooter.style.display = 'flex';
    });
  }

  // Step Validation Logic
  const validateStep = (step) => {
    let isValid = true;
    
    document.querySelectorAll(`.wizard-step[data-step="${step}"] .form-group.invalid`).forEach(el => el.classList.remove('invalid'));
    document.querySelectorAll(`.wizard-step[data-step="${step}"] .error-msg`).forEach(el => el.textContent = '');
    
    if (step === 1) {
      const startDateVal = startDateInput.value;
      if (!startDateVal) {
        markInvalid(startDateInput, 'Start date is required.');
        isValid = false;
      } else {
        const today = new Date();
        today.setHours(0,0,0,0);
        const selectedDate = new Date(startDateVal);
        selectedDate.setHours(0,0,0,0);
        if (selectedDate < today) {
          markInvalid(startDateInput, 'Start date cannot be in the past.');
          isValid = false;
        }
      }
    }
    
    else if (step === 2) {
      const firstNameInput = document.getElementById('wizard-first-name');
      const lastNameInput = document.getElementById('wizard-last-name');
      const emailInput = document.getElementById('wizard-email');
      const phoneInput = document.getElementById('wizard-phone');
      
      if (!firstNameInput.value.trim()) {
        markInvalid(firstNameInput, 'First name is required.');
        isValid = false;
      }
      if (!lastNameInput.value.trim()) {
        markInvalid(lastNameInput, 'Last name is required.');
        isValid = false;
      }
      
      const emailVal = emailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal) {
        markInvalid(emailInput, 'Email is required.');
        isValid = false;
      } else if (!emailRegex.test(emailVal)) {
        markInvalid(emailInput, 'Please enter a valid email address.');
        isValid = false;
      }
      
      if (!phoneInput.value.trim()) {
        markInvalid(phoneInput, 'Phone number is required.');
        isValid = false;
      }
    }
    
    else if (step === 3) {
      if (!uploadedFileBase64) {
        if (dropZone) dropZone.classList.add('invalid');
        if (idErrorMsg) idErrorMsg.textContent = 'Government photo ID is required to register.';
        isValid = false;
      } else {
        if (idErrorMsg) idErrorMsg.textContent = '';
      }
    }
    
    else if (step === 4) {
      const consentCheckbox = document.getElementById('wizard-consent');
      if (!consentCheckbox.checked) {
        const group = consentCheckbox.closest('.disclaimer-consent') || consentCheckbox.parentElement;
        group.classList.add('invalid');
        if (wizardSigErrorMsg) wizardSigErrorMsg.textContent = 'You must agree to the terms to proceed.';
        isValid = false;
      } else {
        const group = consentCheckbox.closest('.disclaimer-consent') || consentCheckbox.parentElement;
        group.classList.remove('invalid');
        if (wizardSigErrorMsg) wizardSigErrorMsg.textContent = '';
      }
      
      if (isValid) {
        if (wizardSigMode === 'draw') {
          if (!wizardSigPad || wizardSigPad.isBlank()) {
            markInvalid(wizardCanvas, 'Please draw your signature.');
            if (wizardSigErrorMsg) wizardSigErrorMsg.textContent = 'Please draw your signature to sign.';
            isValid = false;
          }
        } else {
          if (!wizardTypedSigInput.value.trim()) {
            markInvalid(wizardTypedSigInput, 'Please type your signature.');
            if (wizardSigErrorMsg) wizardSigErrorMsg.textContent = 'Please type your name to sign.';
            isValid = false;
          }
        }
      }
    }
    
    return isValid;
  };

  const markInvalid = (element, message) => {
    const group = element.closest('.form-group') || element.parentElement;
    group.classList.add('invalid');
    let errorSpan = group.querySelector('.error-msg');
    if (!errorSpan && element === wizardCanvas) errorSpan = wizardSigErrorMsg;
    if (errorSpan) {
      errorSpan.textContent = message;
    }
  };

  // Drag & Drop Handlers for Wizard
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    
    ['dragleave', 'dragend'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('dragover');
      });
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processUploadedFile(files[0]);
      }
    });
    
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        processUploadedFile(fileInput.files[0]);
      }
    });
  }

  const processUploadedFile = (file) => {
    if (idErrorMsg) idErrorMsg.textContent = '';
    if (dropZone) dropZone.classList.remove('invalid');
    
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      if (idErrorMsg) idErrorMsg.textContent = 'File is too large. Maximum size is 10MB.';
      return;
    }
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      if (idErrorMsg) idErrorMsg.textContent = 'Unsupported file format. Please upload JPG, PNG, WEBP, or PDF.';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedFileBase64 = e.target.result;
      uploadedFileName = file.name;
      uploadedFileType = file.type;
      
      if (previewFileName) previewFileName.textContent = file.name;
      if (previewFileSize) {
        const sizeKB = (file.size / 1024).toFixed(1);
        previewFileSize.textContent = sizeKB > 1000 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      }
      
      if (dropZone) dropZone.style.display = 'none';
      if (previewContainer) previewContainer.style.display = 'flex';
    };
    reader.onerror = () => {
      if (idErrorMsg) idErrorMsg.textContent = 'Error reading file. Please try again.';
    };
    reader.readAsDataURL(file);
  };

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', () => {
      uploadedFileBase64 = null;
      uploadedFileName = '';
      uploadedFileType = '';
      if (fileInput) fileInput.value = '';
      if (previewContainer) previewContainer.style.display = 'none';
      if (dropZone) dropZone.style.display = 'block';
    });
  }

  // Signature Tab Switching for Wizard
  const selectSigTab = (mode) => {
    wizardSigMode = mode;
    
    if (mode === 'draw') {
      wizardTabDraw.classList.add('active');
      wizardTabDraw.setAttribute('aria-selected', 'true');
      wizardTabType.classList.remove('active');
      wizardTabType.setAttribute('aria-selected', 'false');
      
      wizardPanelDraw.style.display = 'block';
      wizardPanelType.style.display = 'none';
    } else {
      wizardTabType.classList.add('active');
      wizardTabType.setAttribute('aria-selected', 'true');
      wizardTabDraw.classList.remove('active');
      wizardTabDraw.setAttribute('aria-selected', 'false');
      
      wizardPanelType.style.display = 'block';
      wizardPanelDraw.style.display = 'none';
      
      const firstName = document.getElementById('wizard-first-name').value.trim();
      const lastName = document.getElementById('wizard-last-name').value.trim();
      if ((firstName || lastName) && wizardTypedSigInput && !wizardTypedSigInput.value) {
        wizardTypedSigInput.value = `${firstName} ${lastName}`;
      }
    }
  };

  if (wizardTabDraw && wizardTabType) {
    wizardTabDraw.addEventListener('click', () => selectSigTab('draw'));
    wizardTabType.addEventListener('click', () => selectSigTab('type'));
  }

  // Policy Scroll Detection for Wizard
  const wizardPolicyBox = document.getElementById('wizard-policy-box');
  const wizardLockedContainer = document.getElementById('wizard-locked-sig-container');
  const wizardScrollAlert = document.getElementById('wizard-scroll-alert');

  if (wizardPolicyBox) {
    wizardPolicyBox.addEventListener('scroll', () => {
      const isAtBottom = wizardPolicyBox.scrollTop + wizardPolicyBox.clientHeight >= wizardPolicyBox.scrollHeight - 15;
      if (isAtBottom && wizardLockedContainer && wizardLockedContainer.classList.contains('locked')) {
        wizardLockedContainer.classList.remove('locked');
        if (wizardScrollAlert) wizardScrollAlert.style.display = 'none';
        
        const disabledElements = wizardLockedContainer.querySelectorAll('input, button');
        disabledElements.forEach(el => el.removeAttribute('disabled'));
      }
    });
  }

  // Submit Wizard Form
  const submitWizardForm = async () => {
    goToStep(5);
    wizardFooter.style.display = 'none';
    
    const formData = new FormData(wizardForm);
    const payload = {
      first_name: formData.get('first_name'),
      last_name: formData.get('last_name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      membership_term: formData.get('membership_term'),
      membership_start_date: formData.get('membership_start_date'),
      copy_of_id: {
        base64: uploadedFileBase64,
        filename: uploadedFileName,
        mimeType: uploadedFileType
      },
      date_of_signing: signingDateInput.value,
      signature: {
        type: wizardSigMode
      }
    };
    
    if (wizardSigMode === 'draw') {
      payload.signature.data = wizardSigPad.getDataURL();
    } else {
      payload.signature.data = wizardTypedSigInput.value.trim();
    }
    
    try {
      const response = await fetch('/api/submit-agreement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        window.fpTrack?.('conversion', { page: 'passes', label: 'Membership Agreement' });
        document.getElementById('wizard-status-loading').style.display = 'none';
        document.getElementById('wizard-status-success').style.display = 'flex';
      } else {
        throw new Error(result.error || 'Server rejected submission');
      }
    } catch (error) {
      console.error('Wizard submission error:', error);
      document.getElementById('wizard-error-text').textContent = error.message || 'There was a problem submitting your agreement. Please try again.';
      document.getElementById('wizard-status-loading').style.display = 'none';
      document.getElementById('wizard-status-error').style.display = 'flex';
    }
  };
}

// --- Homepage Form Handlers ---
if (homepageForm) {
  // Policy Scroll Detection for Homepage
  if (homepagePolicyBox) {
    homepagePolicyBox.addEventListener('scroll', () => {
      const isAtBottom = homepagePolicyBox.scrollTop + homepagePolicyBox.clientHeight >= homepagePolicyBox.scrollHeight - 15;
      if (isAtBottom && homepageForm.classList.contains('locked')) {
        homepageForm.classList.remove('locked');
        if (homepageScrollAlert) homepageScrollAlert.style.display = 'none';
        
        // Enable all inputs inside the form
        const disabledElements = homepageForm.querySelectorAll('input, select, button');
        disabledElements.forEach(el => el.removeAttribute('disabled'));
        
        // Enable drag & drop zone pointer-events
        if (homepageDropZone) homepageDropZone.style.pointerEvents = 'auto';
        
        // Resize homepage signature pad since container might have been blurred/hidden
        setTimeout(() => {
          if (homepageSigPad) homepageSigPad.resize();
        }, 100);
      }
    });
  }

  // Drag & Drop for Homepage
  if (homepageDropZone && homepageFileInput) {
    homepageDropZone.addEventListener('click', () => {
      if (!homepageForm.classList.contains('locked')) {
        homepageFileInput.click();
      }
    });
    
    homepageDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!homepageForm.classList.contains('locked')) {
        homepageDropZone.classList.add('dragover');
      }
    });
    
    ['dragleave', 'dragend'].forEach(eventName => {
      homepageDropZone.addEventListener(eventName, () => {
        homepageDropZone.classList.remove('dragover');
      });
    });
    
    homepageDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      homepageDropZone.classList.remove('dragover');
      if (homepageForm.classList.contains('locked')) return;
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processHomepageUploadedFile(files[0]);
      }
    });
    
    homepageFileInput.addEventListener('change', () => {
      if (homepageFileInput.files.length > 0) {
        processHomepageUploadedFile(homepageFileInput.files[0]);
      }
    });
  }

  const processHomepageUploadedFile = (file) => {
    if (homepageIdErrorMsg) homepageIdErrorMsg.textContent = '';
    if (homepageDropZone) homepageDropZone.classList.remove('invalid');
    
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      if (homepageIdErrorMsg) homepageIdErrorMsg.textContent = 'File is too large. Maximum size is 10MB.';
      return;
    }
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      if (homepageIdErrorMsg) homepageIdErrorMsg.textContent = 'Unsupported file format. Please upload JPG, PNG, WEBP, or PDF.';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      homepageUploadedFileBase64 = e.target.result;
      homepageUploadedFileName = file.name;
      homepageUploadedFileType = file.type;
      
      if (homepagePreviewFileName) homepagePreviewFileName.textContent = file.name;
      if (homepagePreviewFileSize) {
        const sizeKB = (file.size / 1024).toFixed(1);
        homepagePreviewFileSize.textContent = sizeKB > 1000 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      }
      
      if (homepageDropZone) homepageDropZone.style.display = 'none';
      if (homepagePreviewContainer) homepagePreviewContainer.style.display = 'flex';
    };
    reader.onerror = () => {
      if (homepageIdErrorMsg) homepageIdErrorMsg.textContent = 'Error reading file. Please try again.';
    };
    reader.readAsDataURL(file);
  };

  if (homepageBtnRemoveFile) {
    homepageBtnRemoveFile.addEventListener('click', () => {
      homepageUploadedFileBase64 = null;
      homepageUploadedFileName = '';
      homepageUploadedFileType = '';
      if (homepageFileInput) homepageFileInput.value = '';
      if (homepagePreviewContainer) homepagePreviewContainer.style.display = 'none';
      if (homepageDropZone) homepageDropZone.style.display = 'block';
    });
  }

  // Signature Tabs for Homepage
  const selectHomepageSigTab = (mode) => {
    homepageSigMode = mode;
    
    if (mode === 'draw') {
      homepageTabDraw.classList.add('active');
      homepageTabDraw.setAttribute('aria-selected', 'true');
      homepageTabType.classList.remove('active');
      homepageTabType.setAttribute('aria-selected', 'false');
      
      homepagePanelDraw.style.display = 'block';
      homepagePanelType.style.display = 'none';
    } else {
      homepageTabType.classList.add('active');
      homepageTabType.setAttribute('aria-selected', 'true');
      homepageTabDraw.classList.remove('active');
      homepageTabDraw.setAttribute('aria-selected', 'false');
      
      homepagePanelType.style.display = 'block';
      homepagePanelDraw.style.display = 'none';
      
      const firstName = document.getElementById('homepage-first-name').value.trim();
      const lastName = document.getElementById('homepage-last-name').value.trim();
      if ((firstName || lastName) && homepageTypedSigInput && !homepageTypedSigInput.value) {
        homepageTypedSigInput.value = `${firstName} ${lastName}`;
      }
    }
  };

  if (homepageTabDraw && homepageTabType) {
    homepageTabDraw.addEventListener('click', () => selectHomepageSigTab('draw'));
    homepageTabType.addEventListener('click', () => selectHomepageSigTab('type'));
  }

  // Validation
  const validateHomepageForm = () => {
    let isValid = true;
    
    const errorMsgs = homepageForm.querySelectorAll('.error-msg');
    errorMsgs.forEach(el => el.textContent = '');
    const invalidGroups = homepageForm.querySelectorAll('.form-group.invalid');
    invalidGroups.forEach(el => el.classList.remove('invalid'));
    
    const consentGroup = homepageForm.querySelector('.disclaimer-consent');
    if (consentGroup) consentGroup.classList.remove('invalid');
    
    const firstNameInput = document.getElementById('homepage-first-name');
    if (!firstNameInput.value.trim()) {
      markHomepageInvalid(firstNameInput, 'First name is required.');
      isValid = false;
    }
    
    const lastNameInput = document.getElementById('homepage-last-name');
    if (!lastNameInput.value.trim()) {
      markHomepageInvalid(lastNameInput, 'Last name is required.');
      isValid = false;
    }
    
    const emailInput = document.getElementById('homepage-email');
    const emailVal = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal) {
      markHomepageInvalid(emailInput, 'Email is required.');
      isValid = false;
    } else if (!emailRegex.test(emailVal)) {
      markHomepageInvalid(emailInput, 'Please enter a valid email address.');
      isValid = false;
    }
    
    const phoneInput = document.getElementById('homepage-phone');
    if (!phoneInput.value.trim()) {
      markHomepageInvalid(phoneInput, 'Phone number is required.');
      isValid = false;
    }
    
    const termInput = document.getElementById('homepage-membership-term');
    if (!termInput.value) {
      markHomepageInvalid(termInput, 'Membership term is required.');
      isValid = false;
    }
    
    const startDateVal = homepageStartDateInput.value;
    if (!startDateVal) {
      markHomepageInvalid(homepageStartDateInput, 'Start date is required.');
      isValid = false;
    } else {
      const today = new Date();
      today.setHours(0,0,0,0);
      const selectedDate = new Date(startDateVal);
      selectedDate.setHours(0,0,0,0);
      if (selectedDate < today) {
        markHomepageInvalid(homepageStartDateInput, 'Start date cannot be in the past.');
        isValid = false;
      }
    }
    
    if (!homepageUploadedFileBase64) {
      if (homepageDropZone) homepageDropZone.classList.add('invalid');
      if (homepageIdErrorMsg) homepageIdErrorMsg.textContent = 'Government photo ID is required to register.';
      isValid = false;
    }
    
    const consentCheckbox = document.getElementById('homepage-consent');
    if (!consentCheckbox.checked) {
      if (consentGroup) consentGroup.classList.add('invalid');
      if (homepageSigErrorMsg) homepageSigErrorMsg.textContent = 'You must agree to the terms to proceed.';
      isValid = false;
    }
    
    if (isValid) {
      if (homepageSigMode === 'draw') {
        if (!homepageSigPad || homepageSigPad.isBlank()) {
          markHomepageInvalid(homepageCanvas, 'Please draw your signature.');
          if (homepageSigErrorMsg) homepageSigErrorMsg.textContent = 'Please draw your signature to sign.';
          isValid = false;
        }
      } else {
        if (!homepageTypedSigInput.value.trim()) {
          markHomepageInvalid(homepageTypedSigInput, 'Please type your signature.');
          if (homepageSigErrorMsg) homepageSigErrorMsg.textContent = 'Please type your name to sign.';
          isValid = false;
        }
      }
    }
    
    return isValid;
  };

  const markHomepageInvalid = (element, message) => {
    const group = element.closest('.form-group') || element.parentElement;
    group.classList.add('invalid');
    let errorSpan = group.querySelector('.error-msg');
    if (!errorSpan && element === homepageCanvas) errorSpan = homepageSigErrorMsg;
    if (errorSpan) {
      errorSpan.textContent = message;
    }
  };

  // Submit homepage form
  const submitHomepageForm = async (e) => {
    e.preventDefault();
    if (!validateHomepageForm()) return;
    
    const loader = document.getElementById('homepage-status-loading');
    const successScreen = document.getElementById('homepage-status-success');
    const errorScreen = document.getElementById('homepage-status-error');
    const submitBtn = document.getElementById('btn-homepage-submit');
    
    if (loader) loader.style.display = 'flex';
    if (successScreen) successScreen.style.display = 'none';
    if (errorScreen) errorScreen.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    
    const formData = new FormData(homepageForm);
    const payload = {
      first_name: formData.get('first_name'),
      last_name: formData.get('last_name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      membership_term: formData.get('membership_term'),
      membership_start_date: formData.get('membership_start_date'),
      copy_of_id: {
        base64: homepageUploadedFileBase64,
        filename: homepageUploadedFileName,
        mimeType: homepageUploadedFileType
      },
      date_of_signing: homepageSigningDateInput.value,
      signature: {
        type: homepageSigMode
      }
    };
    
    if (homepageSigMode === 'draw') {
      payload.signature.data = homepageSigPad.getDataURL();
    } else {
      payload.signature.data = homepageTypedSigInput.value.trim();
    }
    
    try {
      const response = await fetch('/api/submit-agreement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        window.fpTrack?.('conversion', { page: 'passes', label: 'Membership Agreement' });
        if (loader) loader.style.display = 'none';
        if (successScreen) successScreen.style.display = 'flex';
        
        homepageForm.reset();
        if (homepageSigPad) homepageSigPad.clear();
        homepageUploadedFileBase64 = null;
        homepageUploadedFileName = '';
        homepageUploadedFileType = '';
        
        if (homepagePreviewContainer) homepagePreviewContainer.style.display = 'none';
        if (homepageDropZone) homepageDropZone.style.display = 'block';
        
        // Re-lock homepage form
        homepageForm.classList.add('locked');
        if (homepageScrollAlert) homepageScrollAlert.style.display = 'flex';
        if (homepagePolicyBox) homepagePolicyBox.scrollTop = 0;
        
        const disabledElements = homepageForm.querySelectorAll('input, select, button');
        disabledElements.forEach(el => el.setAttribute('disabled', ''));
        if (homepageDropZone) homepageDropZone.style.pointerEvents = 'none';
      } else {
        throw new Error(result.error || 'Server rejected submission');
      }
    } catch (error) {
      console.error('Homepage submission error:', error);
      const errorText = document.getElementById('homepage-error-text');
      if (errorText) errorText.textContent = error.message || 'There was a problem submitting your agreement. Please try again.';
      if (loader) loader.style.display = 'none';
      if (errorScreen) errorScreen.style.display = 'flex';
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  homepageForm.addEventListener('submit', submitHomepageForm);

  const homepageRetryBtn = document.getElementById('homepage-btn-retry');
  if (homepageRetryBtn) {
    homepageRetryBtn.addEventListener('click', () => {
      const errorScreen = document.getElementById('homepage-status-error');
      const submitBtn = document.getElementById('btn-homepage-submit');
      if (errorScreen) errorScreen.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
    });
  }
}

// ---------- Idle Prefetch of Below-the-Fold Images ----------
// Once the page (including the hero) has fully loaded and the browser is
// sitting idle, quietly warm the below-the-fold images in the background at
// low priority. By the time the visitor scrolls down they're already cached,
// so there's no lazy-load pop-in — without ever competing with the hero/first
// paint or wasting bandwidth at the critical moment.
function prefetchBelowFoldImages() {
  // Only the lazy <img> elements; the eager hero is already loaded, and the
  // lazy Google Maps <iframe> is intentionally left alone.
  document.querySelectorAll('img[loading="lazy"]').forEach(img => {
    const src = img.currentSrc || img.getAttribute('src');
    if (!src) return;
    const warm = new Image();
    warm.decoding = 'async';
    if ('fetchPriority' in warm) warm.fetchPriority = 'low';
    warm.src = src; // served from cache when the real <img> enters the viewport
  });
}

function scheduleIdlePrefetch() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetchBelowFoldImages, { timeout: 4000 });
  } else {
    setTimeout(prefetchBelowFoldImages, 1500);
  }
}

if (document.readyState === 'complete') {
  scheduleIdlePrefetch();
} else {
  window.addEventListener('load', scheduleIdlePrefetch, { once: true });
}

// ---------- Footer year (keeps copyright current automatically) ----------
const footerYear = document.getElementById('footer-year');
if (footerYear) footerYear.textContent = new Date().getFullYear();

// ---------- Live Class Timetable ----------
// Pulls the owner-managed dated schedule from /api/classes and renders the
// NEXT 7 DAYS as a timetable in the Classes section — today on the far left,
// each day labelled with its real date, classes showing their image when set.
// Stays hidden if nothing's scheduled or the endpoint is unavailable, so the
// section degrades gracefully.
(function initClassSchedule() {
  const host = document.getElementById('class-schedule');
  const grid = document.getElementById('class-schedule-grid');
  if (!host || !grid) return;

  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const safeColor = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : 'var(--color-accent)');
  const safeUrl = (u) => (/^https?:\/\//.test(u) ? u : '');
  const fmt = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
  };
  const ord = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

  // "today" in gym-local time (East Africa), and the next 7 ISO dates.
  let todayIso;
  try {
    todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  } catch {
    todayIso = new Date().toISOString().slice(0, 10);
  }
  const ymd = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (iso, n) => { const dt = ymd(iso); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };

  fetch('/api/classes')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.schedule) || !data.schedule.length) return;
      const tById = {};
      (data.templates || []).forEach((t) => (tById[t.id] = t));

      const byDate = {};
      data.schedule.forEach((e) => {
        if (!e || typeof e.date !== 'string') return;
        (byDate[e.date] = byDate[e.date] || []).push(e);
      });

      let html = '';
      for (let off = 0; off < 7; off++) {
        const iso = addDays(todayIso, off);
        const entries = (byDate[iso] || []).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
        if (!entries.length) continue;
        const dt = ymd(iso);
        const dayName = off === 0 ? 'Today' : DOW[dt.getUTCDay()];
        const dayDate = `${dt.getUTCDate()}${ord(dt.getUTCDate())} ${MON[dt.getUTCMonth()]}`;
        html += `<div class="tt-day"><div class="tt-day-head"><span class="tt-day-name">${dayName}</span><span class="tt-day-date">${dayDate}</span></div><div class="tt-day-classes">`;
        entries.forEach((e) => {
          const t = tById[e.templateId] || {};
          const url = safeUrl(t.image || '');
          const img = url ? `<div class="tt-class-img"><img src="${esc(url)}" alt="${esc(e.name)}" loading="lazy" /></div>` : '';
          let reg = '';
          if (e.classId) {
            const cap = e.capacity != null ? e.capacity : 12;
            const spaces = Math.max(0, cap - (e.registered || 0));
            reg = `<div class="tt-class-reg" data-classid="${esc(e.classId)}">${
              spaces > 0
                ? `<span class="tt-spaces">${spaces} space${spaces === 1 ? '' : 's'} left</span><button type="button" class="tt-register-btn">Register</button>`
                : `<span class="tt-spaces full">Class full</span>`
            }</div>`;
          }
          html += `<div class="tt-class${url ? ' has-img' : ''}" style="--c:${safeColor(t.color)}">
            ${img}
            <div class="tt-class-body">
              <div class="tt-class-time">${esc(fmt(e.start_time))}${e.end_time ? ' – ' + esc(fmt(e.end_time)) : ''}</div>
              <div class="tt-class-name">${esc(e.name)}</div>
              ${t.instructor ? `<div class="tt-class-trainer">${esc(t.instructor)}</div>` : ''}
              ${reg}
            </div>
          </div>`;
        });
        html += `</div></div>`;
      }
      if (!html) return;
      grid.innerHTML = html;
      host.hidden = false;
      host.classList.add('revealed'); // it was display:none when the reveal observer ran
      grid.addEventListener('click', onRegClick);
    })
    .catch(() => {});

  // Inline register flow: Register → name input → Confirm → POST /api/register.
  function onRegClick(ev) {
    const reg = ev.target.closest('.tt-class-reg');
    if (!reg) return;
    if (ev.target.closest('.tt-register-btn')) {
      reg.dataset.orig = reg.innerHTML;
      reg.innerHTML =
        '<input type="text" class="tt-reg-input" placeholder="Your name" maxlength="60" aria-label="Your name" />' +
        '<div class="tt-reg-actions"><button type="button" class="tt-reg-confirm">Confirm</button>' +
        '<button type="button" class="tt-reg-cancel">Cancel</button></div>';
      const input = reg.querySelector('.tt-reg-input');
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitReg(reg); });
    } else if (ev.target.closest('.tt-reg-cancel')) {
      if (reg.dataset.orig != null) reg.innerHTML = reg.dataset.orig;
    } else if (ev.target.closest('.tt-reg-confirm')) {
      submitReg(reg);
    }
  }

  function submitReg(reg) {
    const input = reg.querySelector('.tt-reg-input');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const classId = reg.dataset.classid;
    reg.querySelectorAll('button, input').forEach((n) => (n.disabled = true));
    const confirmBtn = reg.querySelector('.tt-reg-confirm');
    if (confirmBtn) confirmBtn.textContent = '…';
    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, name }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d.ok) {
          const left = typeof d.spaces === 'number' ? ` · ${d.spaces} left` : '';
          reg.innerHTML = `<span class="tt-reg-done">✓ ${d.already ? "You're already on the list" : "You're booked in"}</span><span class="tt-spaces">${esc(name)}${left}</span>`;
        } else {
          const msg = (d && d.message) || 'Could not register — please try again.';
          reg.innerHTML = `<span class="tt-spaces full">${esc(msg)}</span>` + (reg.dataset.orig != null ? '<button type="button" class="tt-register-btn">Try again</button>' : '');
        }
      })
      .catch(() => {
        reg.innerHTML = '<span class="tt-spaces full">Network error — please try again.</span><button type="button" class="tt-register-btn">Try again</button>';
      });
  }
})();

