/* ============================================
   FitPit ZNZ — Interactive Functionality
   ============================================ */

// ---------- Theme Switcher ----------
const themeBtns = document.querySelectorAll('.theme-btn');

// Apply saved theme
const savedTheme = localStorage.getItem('fitpit-theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === savedTheme);
  });
}

themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;

    if (theme === 'lime') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }

    localStorage.setItem('fitpit-theme', theme);

    themeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

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
    const dialogDimensions = clinicModal.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      closeModal();
    }
  });
}

/* ==================== Membership Agreement Wizard Controller ==================== */

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

// File Upload Variables
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

// Signature Variables
const canvas = document.getElementById('signature-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const btnClearSig = document.getElementById('btn-clear-sig');
const tabDraw = document.getElementById('tab-draw');
const tabType = document.getElementById('tab-type');
const panelDraw = document.getElementById('panel-draw');
const panelType = document.getElementById('panel-type');
const typedSigInput = document.getElementById('signature-typed');
const sigErrorMsg = document.getElementById('signature-error-msg');
let isCanvasBlank = true;
let isDrawing = false;
let sigMode = 'draw'; // 'draw' or 'type'

let currentStep = 1;
const totalSteps = 4;

if (agreementModal) {
  // Set date field defaults
  const setDates = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    
    if (startDateInput) {
      startDateInput.value = todayStr;
      startDateInput.min = todayStr;
    }
    
    if (signingDateInput) {
      const options = { day: '2-digit', month: 'long', year: 'numeric' };
      signingDateInput.value = today.toLocaleDateString('en-US', options);
    }
  };

  // Resize canvas for high resolution
  const resizeCanvas = () => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Use pixel ratio for sharp drawing
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Set drawing styles
    ctx.strokeStyle = '#aaff00'; // Lime color signature
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    isCanvasBlank = true; // reset blank flag after resize since it clears the canvas
  };

  // Open Modal
  joinBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Select appropriate membership option
      const selectedPass = btn.getAttribute('data-pass');
      if (selectedPass && termSelect) {
        // Find option matching selectedPass
        for (let i = 0; i < termSelect.options.length; i++) {
          if (termSelect.options[i].value.toLowerCase().includes(selectedPass.split(' ')[0].toLowerCase())) {
            termSelect.selectedIndex = i;
            break;
          }
        }
      }
      
      // Initialize dates and states
      resetWizard();
      setDates();
      
      agreementModal.showModal();
      document.body.style.overflow = 'hidden'; // prevent scrolling
      
      // Small timeout to let dialog render before resizing canvas
      setTimeout(resizeCanvas, 100);
    });
  });

  // Close Modal
  const closeAgreementModal = () => {
    agreementModal.close();
    document.body.style.overflow = ''; // restore scrolling
  };

  closeAgreementBtn.addEventListener('click', closeAgreementModal);

  // Close modal when clicking on the backdrop
  agreementModal.addEventListener('click', (e) => {
    const dialogDimensions = agreementModal.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      closeAgreementModal();
    }
  });

  // Reset Wizard State
  const resetWizard = () => {
    currentStep = 1;
    goToStep(1);
    
    // Reset form fields
    wizardForm.reset();
    document.querySelectorAll('.form-group.invalid').forEach(el => el.classList.remove('invalid'));
    document.querySelectorAll('.drag-drop-zone.invalid').forEach(el => el.classList.remove('invalid'));
    
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
    isCanvasBlank = true;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (sigErrorMsg) sigErrorMsg.textContent = '';
    selectSigTab('draw');
    
    // Reset Status Screens
    document.getElementById('wizard-status-loading').style.display = 'flex';
    document.getElementById('wizard-status-success').style.display = 'none';
    document.getElementById('wizard-status-error').style.display = 'none';
    wizardFooter.style.display = 'flex';
  };

  // Navigations
  const goToStep = (step) => {
    currentStep = step;
    
    // Toggle active classes on content panels
    wizardSteps.forEach(s => {
      const stepNum = parseInt(s.getAttribute('data-step'));
      s.classList.toggle('active', stepNum === step);
    });
    
    // Update step markers
    stepNodes.forEach(node => {
      const stepNum = parseInt(node.getAttribute('data-step'));
      node.classList.toggle('active', stepNum === step);
      node.classList.toggle('completed', stepNum < step);
    });
    
    // Update progress bar width
    const percent = ((step - 1) / (totalSteps - 1)) * 100;
    if (progressBar) progressBar.style.width = `${percent}%`;
    
    // Update buttons
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

  // Close on Success screen close button
  const closeSuccessBtn = document.getElementById('btn-wizard-close-success');
  if (closeSuccessBtn) {
    closeSuccessBtn.addEventListener('click', closeAgreementModal);
  }

  // Retry on Error screen button
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
    
    // Clear previous errors
    document.querySelectorAll(`.wizard-step[data-step="${step}"] .form-group.invalid`).forEach(el => el.classList.remove('invalid'));
    
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
        if (sigErrorMsg) sigErrorMsg.textContent = 'You must agree to the terms to proceed.';
        isValid = false;
      } else {
        const group = consentCheckbox.closest('.disclaimer-consent') || consentCheckbox.parentElement;
        group.classList.remove('invalid');
        if (sigErrorMsg) sigErrorMsg.textContent = '';
      }
      
      if (isValid) {
        if (sigMode === 'draw') {
          if (isCanvasBlank) {
            markInvalid(canvas, 'Please draw your signature.');
            if (sigErrorMsg) sigErrorMsg.textContent = 'Please draw your signature to sign.';
            isValid = false;
          }
        } else {
          if (!typedSigInput.value.trim()) {
            markInvalid(typedSigInput, 'Please type your signature.');
            if (sigErrorMsg) sigErrorMsg.textContent = 'Please type your name to sign.';
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
    // Look for error message span
    let errorSpan = group.querySelector('.error-msg');
    if (!errorSpan && element === canvas) errorSpan = sigErrorMsg;
    if (errorSpan) {
      errorSpan.textContent = message;
    }
  };

  // Drag & Drop Handlers
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
    
    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      if (idErrorMsg) idErrorMsg.textContent = 'File is too large. Maximum size is 10MB.';
      return;
    }
    
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      if (idErrorMsg) idErrorMsg.textContent = 'Unsupported file format. Please upload JPG, PNG, WEBP, or PDF.';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedFileBase64 = e.target.result; // data url format
      uploadedFileName = file.name;
      uploadedFileType = file.type;
      
      // Update UI preview
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

  // Signature Pad Logic
  const getPointerPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    isDrawing = true;
    const pos = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isCanvasBlank = false;
    if (sigErrorMsg) sigErrorMsg.textContent = '';
    const group = canvas.closest('.form-group') || canvas.parentElement;
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

  if (canvas && ctx) {
    // Mouse Support
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    // Touch Support for mobile device layout
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
    canvas.addEventListener('touchcancel', stopDrawing);
  }

  if (btnClearSig) {
    btnClearSig.addEventListener('click', () => {
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        isCanvasBlank = true;
      }
    });
  }

  // Signature Tab Switching
  const selectSigTab = (mode) => {
    sigMode = mode;
    
    if (mode === 'draw') {
      tabDraw.classList.add('active');
      tabDraw.setAttribute('aria-selected', 'true');
      tabType.classList.remove('active');
      tabType.setAttribute('aria-selected', 'false');
      
      panelDraw.style.display = 'block';
      panelType.style.display = 'none';
    } else {
      tabType.classList.add('active');
      tabType.setAttribute('aria-selected', 'true');
      tabDraw.classList.remove('active');
      tabDraw.setAttribute('aria-selected', 'false');
      
      panelType.style.display = 'block';
      panelDraw.style.display = 'none';
      
      // Auto-fill typed signature with first and last name if available
      const firstName = document.getElementById('wizard-first-name').value.trim();
      const lastName = document.getElementById('wizard-last-name').value.trim();
      if ((firstName || lastName) && typedSigInput && !typedSigInput.value) {
        typedSigInput.value = `${firstName} ${lastName}`;
      }
    }
  };

  if (tabDraw && tabType) {
    tabDraw.addEventListener('click', () => selectSigTab('draw'));
    tabType.addEventListener('click', () => selectSigTab('type'));
  }

  // Submit Form Function
  const submitWizardForm = async () => {
    goToStep(5); // Show loading step
    wizardFooter.style.display = 'none'; // hide navigation buttons
    
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
        type: sigMode
      }
    };
    
    if (sigMode === 'draw') {
      payload.signature.data = canvas.toDataURL('image/png'); // base64 representation of drawing
    } else {
      payload.signature.data = typedSigInput.value.trim();
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

