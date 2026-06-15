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
