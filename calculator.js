/**
 * LOAN COMPARISON CALCULATOR - Core Logic (v2)
 *
 * Key Design Decisions:
 * 1. Auto-calculate on ANY input change (no button = simulation feel)
 * 2. Debounce inputs to prevent excessive calculations
 * 3. DIFFERENCE IS THE HERO - largest number, most prominent
 * 4. Standard amortization formula (matches most bank calculators)
 * 5. All calculations client-side, zero data sent anywhere
 * 6. Robust edge case handling (term=0, negative values, etc.)
 *
 * Formula used:
 * Monthly Payment = P * [r(1+r)^n] / [(1+r)^n - 1]
 * Where:
 *   P = Principal (loan amount)
 *   r = Monthly interest rate (annual rate / 12)
 *   n = Total number of payments (years * 12)
 */

(function () {
  'use strict';

  // === CONFIGURATION ===
  // Centralized config for easy maintenance and future i18n
  const CONFIG = {
    locale: 'en-US',
    currency: 'USD',
    defaults: {
      amount: 300000,
      term: 30,
      rate: 6.0,
    },
    validation: {
      minAmount: 1000,
      maxAmount: 100000000,
      minTerm: 1,
      maxTerm: 50,
      minRate: 0,
      maxRate: 30,
    },
    debounceMs: 100,
  };

  // === DOM ELEMENTS ===
  const inputs = {
    amountA: document.getElementById('amount-a'),
    termA: document.getElementById('term-a'),
    rateA: document.getElementById('rate-a'),
    amountB: document.getElementById('amount-b'),
    termB: document.getElementById('term-b'),
    rateB: document.getElementById('rate-b'),
  };

  const outputs = {
    // Hero summary
    heroDiff: document.getElementById('hero-diff'),
    heroContext: document.getElementById('hero-context'),
    heroTerm: document.getElementById('hero-term'),
    summaryCard: document.querySelector('.summary-card'),
    // Detailed results
    monthlyA: document.getElementById('monthly-a'),
    monthlyB: document.getElementById('monthly-b'),
    monthlyDiff: document.getElementById('monthly-diff'),
    interestA: document.getElementById('interest-a'),
    interestB: document.getElementById('interest-b'),
    interestDiff: document.getElementById('interest-diff'),
    totalA: document.getElementById('total-a'),
    totalB: document.getElementById('total-b'),
    totalDiff: document.getElementById('total-diff'),
  };

  // === CORE CALCULATION ===

  /**
   * Calculate monthly payment using standard amortization formula
   * @param {number} principal - Loan amount
   * @param {number} annualRate - Annual interest rate as percentage (e.g., 6.5)
   * @param {number} years - Loan term in years
   * @returns {number} Monthly payment amount
   */
  function calculateMonthlyPayment(principal, annualRate, years) {
    // Edge cases
    if (principal <= 0 || years <= 0) {
      return 0;
    }

    // 0% interest = simple division
    if (annualRate === 0) {
      return principal / (years * 12);
    }

    const monthlyRate = annualRate / 100 / 12;
    const totalPayments = years * 12;

    // Pre-calculate compound factor to avoid redundant Math.pow calls
    const compoundFactor = Math.pow(1 + monthlyRate, totalPayments);

    // Guard against overflow (very high rates or very long terms)
    if (!isFinite(compoundFactor)) {
      return 0;
    }

    // Standard amortization formula
    const payment = (principal * monthlyRate * compoundFactor) / (compoundFactor - 1);

    return isFinite(payment) ? payment : 0;
  }

  /**
   * Calculate full loan summary
   * @param {number} principal - Loan amount
   * @param {number} annualRate - Annual interest rate as percentage
   * @param {number} years - Loan term in years
   * @returns {Object} { monthlyPayment, totalInterest, totalPaid, years }
   */
  function calculateLoan(principal, annualRate, years) {
    const monthlyPayment = calculateMonthlyPayment(principal, annualRate, years);
    const totalPaid = monthlyPayment * years * 12;
    const totalInterest = totalPaid - principal;

    return {
      monthlyPayment,
      totalInterest: Math.max(0, totalInterest), // Prevent negative interest display
      totalPaid,
      years,
    };
  }

  // === FORMATTING ===

  /**
   * Format number as currency
   * @param {number} value
   * @returns {string} Formatted string like "$1,234"
   */
  function formatCurrency(value) {
    if (!isFinite(value) || isNaN(value)) {
      return '$0';
    }

    return new Intl.NumberFormat(CONFIG.locale, {
      style: 'currency',
      currency: CONFIG.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }

  // === INPUT PARSING ===

  /**
   * Safely parse input value as number with validation
   * @param {HTMLInputElement} input
   * @param {number} defaultValue
   * @param {number} minValue - Minimum allowed value
   * @param {number} maxValue - Maximum allowed value
   * @returns {number}
   */
  function parseInputValue(input, defaultValue, minValue = 0, maxValue = Infinity) {
    const value = parseFloat(input.value);

    if (isNaN(value)) {
      return defaultValue;
    }

    // Clamp to valid range
    if (value < minValue) {
      return minValue;
    }
    if (value > maxValue) {
      return maxValue;
    }

    return value;
  }

  // === UPDATE UI ===

  /**
   * Update the hero summary card
   * @param {Object} loanA - Loan A calculation result
   * @param {Object} loanB - Loan B calculation result
   */
  function updateHeroSummary(loanA, loanB) {
    const diff = loanA.totalInterest - loanB.totalInterest;
    const absDiff = Math.abs(diff);
    const maxTerm = Math.max(loanA.years, loanB.years);

    // Update amount
    outputs.heroDiff.textContent = formatCurrency(absDiff);
    outputs.heroTerm.textContent = maxTerm;

    // Update context and styling
    outputs.summaryCard.classList.remove('a-higher', 'b-higher', 'equal');

    if (diff > 1) {
      // A pays more interest
      outputs.heroContext.innerHTML = `Loan A pays more over <span id="hero-term">${maxTerm}</span> years`;
      outputs.summaryCard.classList.add('a-higher');
    } else if (diff < -1) {
      // B pays more interest
      outputs.heroContext.innerHTML = `Loan B pays more over <span id="hero-term">${maxTerm}</span> years`;
      outputs.summaryCard.classList.add('b-higher');
    } else {
      // Equal (within $1)
      outputs.heroDiff.textContent = '$0';
      outputs.heroContext.innerHTML = `Both loans cost the same over <span id="hero-term">${maxTerm}</span> years`;
      outputs.summaryCard.classList.add('equal');
    }
  }

  /**
   * Update a difference display element
   * @param {HTMLElement} element - The difference container
   * @param {number} diff - The difference value (A - B)
   * @param {string} label - Label text (e.g., "per month", "total")
   */
  function updateDifferenceDisplay(element, diff, label) {
    const amountEl = element.querySelector('.diff-amount');
    const labelEl = element.querySelector('.diff-label');
    const absDiff = Math.abs(diff);

    // Remove all state classes
    element.classList.remove('b-saves', 'a-saves', 'equal');

    if (diff > 1) {
      // A costs more → B saves money
      amountEl.textContent = formatCurrency(absDiff);
      element.classList.add('b-saves');
    } else if (diff < -1) {
      // B costs more → A saves money
      amountEl.textContent = formatCurrency(absDiff);
      element.classList.add('a-saves');
    } else {
      // Equal (within $1)
      amountEl.textContent = '$0';
      element.classList.add('equal');
    }

    labelEl.textContent = label;
  }

  /**
   * Main calculation and UI update function
   * Called on every input change
   */
  function updateCalculations() {
    const { validation, defaults } = CONFIG;

    // Get input values with validation
    const amountA = parseInputValue(
      inputs.amountA,
      defaults.amount,
      validation.minAmount,
      validation.maxAmount
    );
    const termA = parseInputValue(
      inputs.termA,
      defaults.term,
      validation.minTerm,
      validation.maxTerm
    );
    const rateA = parseInputValue(
      inputs.rateA,
      defaults.rate,
      validation.minRate,
      validation.maxRate
    );

    const amountB = parseInputValue(
      inputs.amountB,
      defaults.amount,
      validation.minAmount,
      validation.maxAmount
    );
    const termB = parseInputValue(
      inputs.termB,
      defaults.term,
      validation.minTerm,
      validation.maxTerm
    );
    const rateB = parseInputValue(
      inputs.rateB,
      defaults.rate,
      validation.minRate,
      validation.maxRate
    );

    // Calculate both loans
    const loanA = calculateLoan(amountA, rateA, termA);
    const loanB = calculateLoan(amountB, rateB, termB);

    // Update hero summary (most important!)
    updateHeroSummary(loanA, loanB);

    // Update detailed displays
    outputs.monthlyA.textContent = formatCurrency(loanA.monthlyPayment);
    outputs.monthlyB.textContent = formatCurrency(loanB.monthlyPayment);

    outputs.interestA.textContent = formatCurrency(loanA.totalInterest);
    outputs.interestB.textContent = formatCurrency(loanB.totalInterest);

    outputs.totalA.textContent = formatCurrency(loanA.totalPaid);
    outputs.totalB.textContent = formatCurrency(loanB.totalPaid);

    // Update differences (A - B)
    const monthlyDiff = loanA.monthlyPayment - loanB.monthlyPayment;
    const interestDiff = loanA.totalInterest - loanB.totalInterest;
    const totalDiff = loanA.totalPaid - loanB.totalPaid;

    updateDifferenceDisplay(outputs.monthlyDiff, monthlyDiff, 'per month');
    updateDifferenceDisplay(outputs.interestDiff, interestDiff, 'total interest');
    updateDifferenceDisplay(outputs.totalDiff, totalDiff, 'total paid');
  }

  // === DEBOUNCE ===

  /**
   * Simple debounce function
   * @param {Function} func
   * @param {number} wait - Milliseconds to wait
   * @returns {Function}
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Debounced version for input events
  const debouncedUpdate = debounce(updateCalculations, CONFIG.debounceMs);

  // === EVENT LISTENERS ===

  // Attach listeners to all inputs
  Object.values(inputs).forEach((input) => {
    if (input) {
      input.addEventListener('input', debouncedUpdate);
    }
  });

  // === INITIALIZATION ===

  // Run initial calculation on page load
  updateCalculations();

  /*
   * === PHASE 2 EXPANSION IDEAS (DO NOT IMPLEMENT NOW) ===
   *
   * 1. Amortization Schedule Table
   *    - Show year-by-year breakdown
   *    - Toggle visibility to keep UI clean
   *    - SEO value: "amortization schedule calculator"
   *
   * 2. Variable Rate Simulation
   *    - Let user input expected rate changes
   *    - Show "what if rate increases by X%"
   *    - SEO value: "variable rate mortgage calculator"
   *
   * 3. Break-Even Point Calculator
   *    - "At what rate does variable become worse than fixed?"
   *    - High-intent keyword targeting
   *
   * 4. URL Parameter Sharing
   *    - Example: ?a=300000,30,6.5&b=300000,30,5.8
   *    - Enables bookmarking and sharing results
   *    - Increases backlinks potential
   *
   * 5. Currency/Locale Support
   *    - Use CONFIG.locale and CONFIG.currency
   *    - Already structured for easy implementation
   *
   * 6. Export calculateLoan for unit testing:
   *    if (typeof module !== 'undefined' && module.exports) {
   *      module.exports = { calculateMonthlyPayment, calculateLoan, formatCurrency };
   *    }
   */
})();
