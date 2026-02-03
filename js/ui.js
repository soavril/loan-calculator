/**
 * 대출 비교 계산기 - UI 로직
 *
 * 기능:
 * - 탭 전환 (모바일)
 * - 입력 자동 계산
 * - 결과 업데이트
 * - 상환 스케줄 표시
 * - CSV 다운로드
 */

(function() {
  'use strict';

  // === DOM 요소 ===
  const DOM = {
    // 탭
    tabs: document.querySelectorAll('.tab-btn'),
    loanACard: document.getElementById('loan-a-card'),
    loanBCard: document.getElementById('loan-b-card'),

    // 요약
    summaryCard: document.getElementById('summary-card'),
    heroDiff: document.getElementById('hero-diff'),
    heroContext: document.getElementById('hero-context'),

    // 대출 A 입력
    principalA: document.getElementById('principal-a'),
    termYearsA: document.getElementById('term-years-a'),
    termMonthsA: document.getElementById('term-months-a'),
    rateA: document.getElementById('rate-a'),
    repaymentA: document.querySelectorAll('input[name="repayment-a"]'),
    graceA: document.getElementById('grace-a'),
    graceRepaymentA: document.querySelectorAll('input[name="grace-repayment-a"]'),
    graceRepaymentAGroup: document.getElementById('grace-repayment-a-group'),

    // 대출 B 입력
    principalB: document.getElementById('principal-b'),
    termYearsB: document.getElementById('term-years-b'),
    termMonthsB: document.getElementById('term-months-b'),
    rateB: document.getElementById('rate-b'),
    repaymentB: document.querySelectorAll('input[name="repayment-b"]'),
    graceB: document.getElementById('grace-b'),
    graceRepaymentB: document.querySelectorAll('input[name="grace-repayment-b"]'),
    graceRepaymentBGroup: document.getElementById('grace-repayment-b-group'),

    // 결과
    resultTypeA: document.getElementById('result-type-a'),
    resultTypeB: document.getElementById('result-type-b'),
    resultMonthlyA: document.getElementById('result-monthly-a'),
    resultMonthlyB: document.getElementById('result-monthly-b'),
    resultInterestA: document.getElementById('result-interest-a'),
    resultInterestB: document.getElementById('result-interest-b'),
    resultTotalA: document.getElementById('result-total-a'),
    resultTotalB: document.getElementById('result-total-b'),
    diffMonthly: document.getElementById('diff-monthly'),
    diffInterest: document.getElementById('diff-interest'),
    diffTotal: document.getElementById('diff-total'),

    // 상환표
    btnScheduleA: document.getElementById('btn-schedule-a'),
    btnScheduleB: document.getElementById('btn-schedule-b'),
    scheduleSection: document.getElementById('schedule-section'),
    scheduleTitle: document.getElementById('schedule-title'),
    scheduleTbody: document.getElementById('schedule-tbody'),
    btnDownloadCSV: document.getElementById('btn-download-csv'),
    btnCloseSchedule: document.getElementById('btn-close-schedule'),

    // 힌트
    principalAHint: document.getElementById('principal-a-hint'),
    principalBHint: document.getElementById('principal-b-hint'),
  };

  // === 상태 ===
  let currentSchedule = null;
  let currentScheduleLoan = null;

  // === 유틸리티 ===

  /**
   * 천 단위 콤마 포맷팅
   */
  function formatNumber(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 콤마 제거하고 숫자 반환
   */
  function parseNumber(str) {
    return parseInt(str.replace(/,/g, ''), 10) || 0;
  }

  /**
   * Debounce 함수
   */
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // === 탭 전환 ===

  function initTabs() {
    DOM.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // 탭 버튼 상태
        DOM.tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        // 카드 표시
        if (targetTab === 'loan-a') {
          DOM.loanACard.classList.add('active');
          DOM.loanBCard.classList.remove('active');
        } else {
          DOM.loanACard.classList.remove('active');
          DOM.loanBCard.classList.add('active');
        }
      });
    });

    // 초기 상태
    DOM.loanACard.classList.add('active');
  }

  // === 금액 입력 포맷팅 ===

  function initPrincipalInput(input, hintEl) {
    // 입력 시 포맷팅
    input.addEventListener('input', (e) => {
      const raw = parseNumber(e.target.value);
      e.target.value = formatNumber(raw);
      e.target.dataset.raw = raw;

      // 힌트 업데이트
      if (hintEl) {
        hintEl.textContent = LoanCalculator.formatKRWReadable(raw);
      }

      debouncedCalculate();
    });

    // 포커스 시 전체 선택
    input.addEventListener('focus', (e) => {
      setTimeout(() => e.target.select(), 0);
    });
  }

  // === 기간 동기화 ===

  function initTermSync(yearsInput, monthsInput) {
    yearsInput.addEventListener('input', () => {
      const years = parseInt(yearsInput.value, 10) || 0;
      monthsInput.value = years * 12;
      debouncedCalculate();
    });

    monthsInput.addEventListener('input', () => {
      const months = parseInt(monthsInput.value, 10) || 0;
      yearsInput.value = Math.floor(months / 12);
      debouncedCalculate();
    });
  }

  // === 거치기간 토글 ===

  function initGraceToggle(graceInput, graceGroupEl) {
    graceInput.addEventListener('input', () => {
      const grace = parseInt(graceInput.value, 10) || 0;
      graceGroupEl.style.display = grace > 0 ? 'block' : 'none';
      debouncedCalculate();
    });
  }

  // === 입력값 수집 ===

  function getLoanInputs(side) {
    const isA = side === 'A';

    const principal = parseNumber(isA ? DOM.principalA.value : DOM.principalB.value);
    const months = parseInt((isA ? DOM.termMonthsA : DOM.termMonthsB).value, 10) || 360;
    const rate = parseFloat((isA ? DOM.rateA : DOM.rateB).value) || 0;
    const grace = parseInt((isA ? DOM.graceA : DOM.graceB).value, 10) || 0;

    // 상환방식
    let repaymentType = 'equalPrincipalInterest';
    const repaymentRadios = isA ? DOM.repaymentA : DOM.repaymentB;
    repaymentRadios.forEach(radio => {
      if (radio.checked) repaymentType = radio.value;
    });

    // 거치 후 상환방식
    let graceRepaymentType = 'EPI';
    if (grace > 0) {
      const graceRadios = isA ? DOM.graceRepaymentA : DOM.graceRepaymentB;
      graceRadios.forEach(radio => {
        if (radio.checked) graceRepaymentType = radio.value;
      });
    }

    // 거치기간이 있으면 상환방식 변경
    let finalType = repaymentType;
    if (grace > 0 && repaymentType !== 'bullet') {
      finalType = graceRepaymentType === 'EP' ? 'graceEqualPrincipal' : 'graceEqualPrincipalInterest';
    }

    return { principal, months, rate, grace, type: finalType };
  }

  // === 계산 및 결과 업데이트 ===

  function calculate() {
    const inputA = getLoanInputs('A');
    const inputB = getLoanInputs('B');

    // 계산
    const resultA = LoanCalculator.calculate(
      inputA.type,
      inputA.principal,
      inputA.rate,
      inputA.months,
      inputA.grace
    );

    const resultB = LoanCalculator.calculate(
      inputB.type,
      inputB.principal,
      inputB.rate,
      inputB.months,
      inputB.grace
    );

    // 결과 업데이트
    updateResults(resultA, resultB);
    updateHeroSummary(resultA, resultB);
  }

  const debouncedCalculate = debounce(calculate, 100);

  function updateResults(resultA, resultB) {
    // 상환방식
    DOM.resultTypeA.textContent = resultA.typeName;
    DOM.resultTypeB.textContent = resultB.typeName;

    // 월 납부액
    DOM.resultMonthlyA.textContent = LoanCalculator.formatKRW(resultA.monthlyPayment);
    DOM.resultMonthlyB.textContent = LoanCalculator.formatKRW(resultB.monthlyPayment);
    updateDiffCell(DOM.diffMonthly, resultA.monthlyPayment, resultB.monthlyPayment);

    // 총 이자
    DOM.resultInterestA.textContent = LoanCalculator.formatKRW(resultA.totalInterest);
    DOM.resultInterestB.textContent = LoanCalculator.formatKRW(resultB.totalInterest);
    updateDiffCell(DOM.diffInterest, resultA.totalInterest, resultB.totalInterest);

    // 총 상환액
    DOM.resultTotalA.textContent = LoanCalculator.formatKRW(resultA.totalPayment);
    DOM.resultTotalB.textContent = LoanCalculator.formatKRW(resultB.totalPayment);
    updateDiffCell(DOM.diffTotal, resultA.totalPayment, resultB.totalPayment);
  }

  function updateDiffCell(cell, valueA, valueB) {
    const diff = valueA - valueB;
    const absDiff = Math.abs(diff);

    cell.classList.remove('positive', 'negative');

    if (Math.abs(diff) < 1) {
      cell.textContent = '-';
    } else if (diff > 0) {
      cell.textContent = '+' + LoanCalculator.formatKRW(absDiff);
      cell.classList.add('positive');
    } else {
      cell.textContent = '-' + LoanCalculator.formatKRW(absDiff);
      cell.classList.add('negative');
    }
  }

  function updateHeroSummary(resultA, resultB) {
    const diff = resultA.totalInterest - resultB.totalInterest;
    const absDiff = Math.abs(diff);

    DOM.heroDiff.textContent = LoanCalculator.formatKRWReadable(absDiff);

    DOM.summaryCard.classList.remove('a-higher', 'b-higher', 'equal');

    if (diff > 100) {
      DOM.heroContext.textContent = '대출 A가 더 많은 이자를 납부합니다';
      DOM.summaryCard.classList.add('a-higher');
    } else if (diff < -100) {
      DOM.heroContext.textContent = '대출 B가 더 많은 이자를 납부합니다';
      DOM.summaryCard.classList.add('b-higher');
    } else {
      DOM.heroDiff.textContent = '0원';
      DOM.heroContext.textContent = '두 대출의 총 이자가 동일합니다';
      DOM.summaryCard.classList.add('equal');
    }
  }

  // === 상환 스케줄 ===

  function showSchedule(loan) {
    const input = getLoanInputs(loan);
    const schedule = LoanCalculator.generateSchedule(
      input.type,
      input.principal,
      input.rate,
      input.months,
      input.grace
    );

    currentSchedule = schedule;
    currentScheduleLoan = loan;

    // 제목 업데이트
    DOM.scheduleTitle.textContent = `대출 ${loan} 상환 스케줄`;

    // 테이블 렌더링
    renderScheduleTable(schedule);

    // 표시
    DOM.scheduleSection.style.display = 'block';
    DOM.scheduleSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderScheduleTable(schedule) {
    const tbody = DOM.scheduleTbody;
    tbody.innerHTML = '';

    // 성능을 위해 DocumentFragment 사용
    const fragment = document.createDocumentFragment();

    schedule.forEach(row => {
      const tr = document.createElement('tr');
      if (row.isGracePeriod) {
        tr.classList.add('grace-period');
      }

      tr.innerHTML = `
        <td>${row.month}회차</td>
        <td>${LoanCalculator.formatKRW(row.payment)}</td>
        <td>${LoanCalculator.formatKRW(row.principal)}</td>
        <td>${LoanCalculator.formatKRW(row.interest)}</td>
        <td>${LoanCalculator.formatKRW(row.balance)}</td>
      `;

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  }

  function downloadCSV() {
    if (!currentSchedule) return;

    const csv = LoanCalculator.scheduleToCSV(currentSchedule, `대출 ${currentScheduleLoan}`);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `대출${currentScheduleLoan}_상환스케줄.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function closeSchedule() {
    DOM.scheduleSection.style.display = 'none';
    currentSchedule = null;
    currentScheduleLoan = null;
  }

  // === 이벤트 리스너 설정 ===

  function initEventListeners() {
    // 금액 입력
    initPrincipalInput(DOM.principalA, DOM.principalAHint);
    initPrincipalInput(DOM.principalB, DOM.principalBHint);

    // 기간 동기화
    initTermSync(DOM.termYearsA, DOM.termMonthsA);
    initTermSync(DOM.termYearsB, DOM.termMonthsB);

    // 거치기간 토글
    initGraceToggle(DOM.graceA, DOM.graceRepaymentAGroup);
    initGraceToggle(DOM.graceB, DOM.graceRepaymentBGroup);

    // 이자율
    DOM.rateA.addEventListener('input', debouncedCalculate);
    DOM.rateB.addEventListener('input', debouncedCalculate);

    // 상환방식
    DOM.repaymentA.forEach(radio => radio.addEventListener('change', debouncedCalculate));
    DOM.repaymentB.forEach(radio => radio.addEventListener('change', debouncedCalculate));
    DOM.graceRepaymentA.forEach(radio => radio.addEventListener('change', debouncedCalculate));
    DOM.graceRepaymentB.forEach(radio => radio.addEventListener('change', debouncedCalculate));

    // 상환표 버튼
    DOM.btnScheduleA.addEventListener('click', () => showSchedule('A'));
    DOM.btnScheduleB.addEventListener('click', () => showSchedule('B'));
    DOM.btnDownloadCSV.addEventListener('click', downloadCSV);
    DOM.btnCloseSchedule.addEventListener('click', closeSchedule);
  }

  // === 초기화 ===

  function init() {
    initTabs();
    initEventListeners();
    calculate(); // 초기 계산
  }

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
