/**
 * 대출 비교 계산기 - UI 로직 v2.1
 *
 * 기능:
 * - 탭 전환 (모바일)
 * - 입력 자동 계산
 * - 결과 업데이트 (검증 배지 포함)
 * - 상환 스케줄 표시 (페이지네이션)
 * - CSV 다운로드
 * - 만기일시상환 경고 배너
 *
 * v2.1 변경사항:
 * - 검증 배지 추가
 * - 만기일시 경고 배너 추가
 * - 상환표 페이지네이션 (12개월/전체)
 * - 테이블 헤더 명확화
 */

(function() {
  'use strict';

  // === 상수 ===
  const DISPLAY_MODES = {
    FIRST_12: 12,
    FIRST_60: 60,
    ALL: Infinity,
  };

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
    rowFinalPayment: document.getElementById('row-final-payment'),
    resultFinalA: document.getElementById('result-final-a'),
    resultFinalB: document.getElementById('result-final-b'),
    diffFinal: document.getElementById('diff-final'),
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
  let currentLoanInfo = null;
  let currentDisplayMode = DISPLAY_MODES.FIRST_12;
  let lastResultA = null;
  let lastResultB = null;

  // === 유틸리티 ===

  function formatNumber(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function parseNumber(str) {
    return parseInt(str.replace(/,/g, ''), 10) || 0;
  }

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

        DOM.tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        if (targetTab === 'loan-a') {
          DOM.loanACard.classList.add('active');
          DOM.loanBCard.classList.remove('active');
        } else {
          DOM.loanACard.classList.remove('active');
          DOM.loanBCard.classList.add('active');
        }
      });
    });

    DOM.loanACard.classList.add('active');
  }

  // === 금액 입력 포맷팅 ===

  function initPrincipalInput(input, hintEl) {
    input.addEventListener('input', (e) => {
      const raw = parseNumber(e.target.value);
      e.target.value = formatNumber(raw);
      e.target.dataset.raw = raw;

      if (hintEl) {
        hintEl.textContent = LoanCalculator.formatKRWReadable(raw);
      }

      debouncedCalculate();
    });

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

    let repaymentType = 'equalPrincipalInterest';
    const repaymentRadios = isA ? DOM.repaymentA : DOM.repaymentB;
    repaymentRadios.forEach(radio => {
      if (radio.checked) repaymentType = radio.value;
    });

    let graceRepaymentType = 'EPI';
    if (grace > 0) {
      const graceRadios = isA ? DOM.graceRepaymentA : DOM.graceRepaymentB;
      graceRadios.forEach(radio => {
        if (radio.checked) graceRepaymentType = radio.value;
      });
    }

    let finalType = repaymentType;
    if (grace > 0 && repaymentType !== 'bullet') {
      finalType = graceRepaymentType === 'EP' ? 'graceEqualPrincipal' : 'graceEqualPrincipalInterest';
    }

    return { principal, months, rate, grace, type: finalType, rawType: repaymentType };
  }

  // === 계산 및 결과 업데이트 ===

  function calculate() {
    const inputA = getLoanInputs('A');
    const inputB = getLoanInputs('B');

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

    lastResultA = resultA;
    lastResultB = resultB;

    updateResults(resultA, resultB);
    updateHeroSummary(resultA, resultB);
    updateWarningBanners(inputA, inputB, resultA, resultB);
    updateValidationBadge(resultA, resultB);
  }

  const debouncedCalculate = debounce(calculate, 100);

  function updateResults(resultA, resultB) {
    // 상환방식
    DOM.resultTypeA.textContent = resultA.typeName;
    DOM.resultTypeB.textContent = resultB.typeName;

    // 월 납부액 (만기일시의 경우 특별 표기)
    const isBulletA = resultA.type === 'bullet';
    const isBulletB = resultB.type === 'bullet';

    if (isBulletA) {
      DOM.resultMonthlyA.innerHTML = LoanCalculator.formatKRW(resultA.monthlyPayment) +
        '<span class="sub-value">(이자만)</span>';
    } else {
      DOM.resultMonthlyA.textContent = LoanCalculator.formatKRW(resultA.monthlyPayment);
    }

    if (isBulletB) {
      DOM.resultMonthlyB.innerHTML = LoanCalculator.formatKRW(resultB.monthlyPayment) +
        '<span class="sub-value">(이자만)</span>';
    } else {
      DOM.resultMonthlyB.textContent = LoanCalculator.formatKRW(resultB.monthlyPayment);
    }

    updateDiffCell(DOM.diffMonthly, resultA.monthlyPayment, resultB.monthlyPayment);

    // 만기 납부액 (만기일시상환이 있는 경우에만 표시)
    if (isBulletA || isBulletB) {
      DOM.rowFinalPayment.style.display = '';

      // 만기일시: 원금 + 마지막 이자 / 기타: 마지막 납부액
      const finalA = isBulletA ? resultA.lastPayment : resultA.lastPayment;
      const finalB = isBulletB ? resultB.lastPayment : resultB.lastPayment;

      if (isBulletA) {
        DOM.resultFinalA.innerHTML = '<strong class="bullet-amount">' +
          LoanCalculator.formatKRW(finalA) + '</strong>';
      } else {
        DOM.resultFinalA.textContent = LoanCalculator.formatKRW(finalA);
      }

      if (isBulletB) {
        DOM.resultFinalB.innerHTML = '<strong class="bullet-amount">' +
          LoanCalculator.formatKRW(finalB) + '</strong>';
      } else {
        DOM.resultFinalB.textContent = LoanCalculator.formatKRW(finalB);
      }

      updateDiffCell(DOM.diffFinal, finalA, finalB);
    } else {
      DOM.rowFinalPayment.style.display = 'none';
    }

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

  // === 경고 배너 ===

  function updateWarningBanners(inputA, inputB, resultA, resultB) {
    // 기존 배너 제거
    document.querySelectorAll('.bullet-warning').forEach(el => el.remove());

    // 만기일시 경고
    if (resultA.type === 'bullet') {
      insertWarningBanner('loan-a-card', resultA.bulletWarning);
    }
    if (resultB.type === 'bullet') {
      insertWarningBanner('loan-b-card', resultB.bulletWarning);
    }
  }

  function insertWarningBanner(cardId, message) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const banner = document.createElement('div');
    banner.className = 'bullet-warning';
    banner.innerHTML = `
      <span class="warning-icon">⚠️</span>
      <span class="warning-text">${message}</span>
    `;

    // 카드 상단에 삽입
    const title = card.querySelector('.loan-title');
    if (title && title.nextSibling) {
      card.insertBefore(banner, title.nextSibling);
    }
  }

  // === 검증 배지 ===

  function updateValidationBadge(resultA, resultB) {
    // 기존 배지 제거
    document.querySelectorAll('.validation-badge').forEach(el => el.remove());

    const resultsSection = document.querySelector('.results');
    if (!resultsSection) return;

    const validA = resultA.validation?.isValid !== false;
    const validB = resultB.validation?.isValid !== false;
    const allValid = validA && validB;

    const badge = document.createElement('div');
    badge.className = `validation-badge ${allValid ? 'valid' : 'invalid'}`;

    if (allValid) {
      badge.innerHTML = `
        <span class="badge-icon">✓</span>
        <span class="badge-text">합계 검증 완료</span>
        <span class="badge-detail">원금 합계 일치 / 잔액 0원</span>
      `;
    } else {
      const errors = [
        ...(resultA.validation?.errors || []),
        ...(resultB.validation?.errors || [])
      ];
      badge.innerHTML = `
        <span class="badge-icon">✗</span>
        <span class="badge-text">검증 주의</span>
        <span class="badge-detail">${errors[0] || '계산 오차 발생'}</span>
      `;
    }

    // 결과 섹션 상단에 삽입
    const title = resultsSection.querySelector('.results-title');
    if (title && title.nextSibling) {
      resultsSection.insertBefore(badge, title.nextSibling);
    } else {
      resultsSection.prepend(badge);
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
    currentLoanInfo = { principal: input.principal, type: input.type };
    currentDisplayMode = DISPLAY_MODES.FIRST_12;

    // 제목 + 만기일시 경고
    let titleHtml = `대출 ${loan} 상환 스케줄`;
    if (input.type === 'bullet') {
      titleHtml += ` <span class="schedule-warning">(만기일시: ${input.months}회차에 원금 전액 상환)</span>`;
    }
    DOM.scheduleTitle.innerHTML = titleHtml;

    // 페이지네이션 컨트롤 생성
    createPaginationControls();

    // 테이블 렌더링
    renderScheduleTable(schedule, currentDisplayMode);

    // 표시
    DOM.scheduleSection.style.display = 'block';
    DOM.scheduleSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function createPaginationControls() {
    // 기존 컨트롤 제거
    document.querySelectorAll('.schedule-pagination').forEach(el => el.remove());

    const controls = document.createElement('div');
    controls.className = 'schedule-pagination';
    controls.innerHTML = `
      <button type="button" class="btn-page active" data-mode="12">첫 12개월</button>
      <button type="button" class="btn-page" data-mode="60">5년 (60개월)</button>
      <button type="button" class="btn-page" data-mode="all">전체 (${currentSchedule.length}개월)</button>
    `;

    // 이벤트 바인딩
    controls.querySelectorAll('.btn-page').forEach(btn => {
      btn.addEventListener('click', () => {
        controls.querySelectorAll('.btn-page').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.dataset.mode;
        currentDisplayMode = mode === 'all' ? DISPLAY_MODES.ALL :
                            mode === '60' ? DISPLAY_MODES.FIRST_60 :
                            DISPLAY_MODES.FIRST_12;
        renderScheduleTable(currentSchedule, currentDisplayMode);
      });
    });

    // 테이블 앞에 삽입
    const tableWrapper = DOM.scheduleSection.querySelector('.schedule-table-wrapper');
    if (tableWrapper) {
      tableWrapper.parentNode.insertBefore(controls, tableWrapper);
    }
  }

  function renderScheduleTable(schedule, displayMode) {
    const tbody = DOM.scheduleTbody;
    tbody.innerHTML = '';

    const visibleRows = displayMode === Infinity ? schedule : schedule.slice(0, displayMode);
    const fragment = document.createDocumentFragment();

    visibleRows.forEach(row => {
      const tr = document.createElement('tr');

      // 거치기간 표시
      if (row.isGracePeriod) {
        tr.classList.add('grace-period');
      }

      // 마지막 행 강조 (만기일시의 경우)
      if (row.month === schedule.length && currentLoanInfo?.type === 'bullet') {
        tr.classList.add('highlight-row');
      }

      tr.innerHTML = `
        <td>${row.month}회차${row.isGracePeriod ? ' <span class="badge-grace">거치</span>' : ''}</td>
        <td class="num">${LoanCalculator.formatKRW(row.payment)}</td>
        <td class="num">${LoanCalculator.formatKRW(row.principal)}</td>
        <td class="num">${LoanCalculator.formatKRW(row.interest)}</td>
        <td class="num">${LoanCalculator.formatKRW(row.balance)}</td>
      `;

      fragment.appendChild(tr);
    });

    // 요약 행 추가 (전체 보기 시)
    if (displayMode === Infinity || visibleRows.length === schedule.length) {
      const summary = LoanCalculator.summarizeSchedule(schedule, currentLoanInfo?.principal || 0);
      const summaryTr = document.createElement('tr');
      summaryTr.classList.add('summary-row');
      summaryTr.innerHTML = `
        <td><strong>합계</strong></td>
        <td class="num"><strong>${LoanCalculator.formatKRW(summary.totalPayment)}</strong></td>
        <td class="num"><strong>${LoanCalculator.formatKRW(summary.totalPrincipalPaid)}</strong></td>
        <td class="num"><strong>${LoanCalculator.formatKRW(summary.totalInterest)}</strong></td>
        <td class="num"><strong>${LoanCalculator.formatKRW(summary.finalBalance)}</strong></td>
      `;
      fragment.appendChild(summaryTr);
    }

    tbody.appendChild(fragment);

    // 더 보기 안내
    if (visibleRows.length < schedule.length) {
      const moreTr = document.createElement('tr');
      moreTr.classList.add('more-row');
      moreTr.innerHTML = `
        <td colspan="5" class="more-info">
          ... ${schedule.length - visibleRows.length}개월 더 보기 (위 버튼 클릭)
        </td>
      `;
      tbody.appendChild(moreTr);
    }
  }

  function downloadCSV() {
    if (!currentSchedule) return;

    const csv = LoanCalculator.scheduleToCSV(currentSchedule, currentLoanInfo || {});
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
    currentLoanInfo = null;
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
    calculate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
