// Parallax Hero Effect
window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const heroBg = document.getElementById('hero-bg');
    if (heroBg) {
        heroBg.style.transform = `translateY(${scrolled * 0.4}px)`;
    }
});

// Intersection Observer for Fade-in animations
document.addEventListener("DOMContentLoaded", () => {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach(el => observer.observe(el));

    // Quiz Logic
    const steps = document.querySelectorAll('.quiz-step');
    const btnNext = document.getElementById('btn-next');
    const btnPrev = document.getElementById('btn-prev');
    const progressFill = document.getElementById('progress-fill');
    const stepTitle = document.getElementById('step-title');
    
    let currentStep = 1;
    const totalSteps = steps.length;
    const userSelections = {};

    const titles = [
        "Step 1: Mood & Atmosphere",
        "Step 2: Lifestyle & Projection",
        "Step 3: Fragrance Notes",
        "Step 4: Layering Preferences"
    ];

    function updateQuizUI() {
        steps.forEach((step, index) => {
            step.classList.remove('active', 'slide-out');
            if (index + 1 === currentStep) {
                step.classList.add('active');
            } else if (index + 1 < currentStep) {
                step.classList.add('slide-out');
            }
        });

        // Update Progress
        const progressPercentage = (currentStep / totalSteps) * 100;
        progressFill.style.width = `${progressPercentage}%`;
        stepTitle.textContent = titles[currentStep - 1];

        // Update Buttons
        btnPrev.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
        
        if (currentStep === totalSteps) {
            btnNext.textContent = "Reveal My Profile";
        } else {
            btnNext.textContent = "Next Step";
        }

        checkStepValidity();
    }

    function checkStepValidity() {
        const currentStepEl = document.querySelector(`.quiz-step[data-step="${currentStep}"]`);
        // For lifestyle step, we have two groups. We need to check if both have selections.
        if (currentStep === 2) {
            const grids = currentStepEl.querySelectorAll('.lifestyle-grid');
            const hasSelection1 = grids[0].querySelector('.quiz-tile.selected');
            const hasSelection2 = grids[1].querySelector('.quiz-tile.selected');
            btnNext.disabled = !(hasSelection1 && hasSelection2);
        } else {
            const hasSelection = currentStepEl.querySelector('.quiz-tile.selected');
            btnNext.disabled = !hasSelection;
        }
    }

    // Tile Selection Logic
    document.querySelectorAll('.quiz-tile').forEach(tile => {
        tile.addEventListener('click', function() {
            // Find parent grid to handle single selection per group
            const parentGrid = this.closest('.tiles-grid');
            parentGrid.querySelectorAll('.quiz-tile').forEach(t => t.classList.remove('selected'));
            this.classList.add('selected');

            // Save selection (for demonstration)
            const stepNum = this.closest('.quiz-step').dataset.step;
            const val = this.dataset.value;
            
            checkStepValidity();
        });
    });

    // Navigation
    btnNext.addEventListener('click', () => {
        if (currentStep < totalSteps) {
            currentStep++;
            updateQuizUI();
        } else {
            // Finish Quiz - Reveal Results
            document.querySelector('.quiz-card').innerHTML = `
                <div style="text-align:center; padding: 4rem 0;">
                    <div class="spinner" style="width: 40px; height: 40px; border: 3px solid rgba(212,175,55,0.3); border-top-color: var(--color-gold); border-radius: 50%; animation: spin 1s cubic-bezier(0.5, 0, 0.5, 1) infinite; margin: 0 auto 2rem;"></div>
                    <style>
                      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    </style>
                    <h2 class="serif-heading-small">Analyzing your scent personality...</h2>
                    <p>Blending notes and preferences.</p>
                </div>
            `;
            setTimeout(() => {
                const consultation = document.getElementById('consultation');
                if (consultation) consultation.style.display = 'none';
                
                ['results', 'wardrobe', 'save-profile'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.display = 'block';
                        setTimeout(() => el.classList.add('visible'), 50);
                    }
                });

                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }, 2500);
        }
    });

    btnPrev.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateQuizUI();
        }
    });

    updateQuizUI();
});
