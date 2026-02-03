/**
 * 대출 비교 계산기 - 계산 로직 모듈 v2.1
 *
 * 지원 상환방식:
 * 1. 원리금균등상환 (Equal Principal and Interest)
 * 2. 원금균등상환 (Equal Principal)
 * 3. 만기일시상환 (Bullet Repayment)
 * 4. 거치식 (Grace Period + Amortization)
 *
 * v2.1 변경사항:
 * - Single Source of Truth: Summary를 Schedule에서 산출
 * - validateSchedule(): 불변식 검증 함수 추가
 * - summarizeSchedule(): 스케줄에서 요약 추출
 *
 * 공식 출처: 한국주택금융공사, 시중은행 대출 계산 기준
 * 이자 계산 방식: 월할 단리 (월 이자율 = 연이율 / 12)
 */

const LoanCalculator = (function() {
  'use strict';

  // === 설정 ===
  const CONFIG = {
    // 반올림: 원 단위
    roundToWon: true,
    // 검증 허용 오차 (원)
    toleranceWon: 10,
    // 검증 범위
    validation: {
      minPrincipal: 100000,        // 최소 10만원
      maxPrincipal: 10000000000,   // 최대 100억
      minMonths: 1,
      maxMonths: 600,              // 최대 50년
      minRate: 0,
      maxRate: 30,
      maxGraceMonths: 120,         // 최대 거치기간 10년
    }
  };

  // === 상환방식 상수 ===
  const REPAYMENT_TYPES = {
    EQUAL_PRINCIPAL_INTEREST: 'equalPrincipalInterest',  // 원리금균등
    EQUAL_PRINCIPAL: 'equalPrincipal',                    // 원금균등
    BULLET: 'bullet',                                      // 만기일시
    GRACE_EPI: 'graceEqualPrincipalInterest',             // 거치 + 원리금균등
    GRACE_EP: 'graceEqualPrincipal',                      // 거치 + 원금균등
  };

  // === 유틸리티 함수 ===

  /**
   * 원 단위 반올림
   */
  function roundWon(value) {
    if (!isFinite(value) || isNaN(value)) return 0;
    return CONFIG.roundToWon ? Math.round(value) : value;
  }

  /**
   * 월 이자율 계산 (연이율 % → 월이율 소수)
   */
  function getMonthlyRate(annualRatePercent) {
    return annualRatePercent / 100 / 12;
  }

  /**
   * 입력값 검증
   */
  function validateInputs(principal, annualRate, months, graceMonths = 0) {
    const v = CONFIG.validation;
    const errors = [];

    if (principal < v.minPrincipal || principal > v.maxPrincipal) {
      errors.push(`대출금액은 ${formatKRW(v.minPrincipal)} ~ ${formatKRW(v.maxPrincipal)} 범위여야 합니다.`);
    }
    if (months < v.minMonths || months > v.maxMonths) {
      errors.push(`대출기간은 ${v.minMonths} ~ ${v.maxMonths}개월 범위여야 합니다.`);
    }
    if (annualRate < v.minRate || annualRate > v.maxRate) {
      errors.push(`이자율은 ${v.minRate} ~ ${v.maxRate}% 범위여야 합니다.`);
    }
    if (graceMonths < 0 || graceMonths > v.maxGraceMonths) {
      errors.push(`거치기간은 0 ~ ${v.maxGraceMonths}개월 범위여야 합니다.`);
    }
    if (graceMonths >= months) {
      errors.push('거치기간은 총 대출기간보다 짧아야 합니다.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // === 스케줄 요약 (Single Source of Truth) ===

  /**
   * 스케줄에서 요약 정보 추출
   * @param {Array} schedule - 상환 스케줄 배열
   * @param {number} originalPrincipal - 원래 대출 원금
   * @returns {Object} 요약 정보
   */
  function summarizeSchedule(schedule, originalPrincipal) {
    if (!schedule || schedule.length === 0) {
      return {
        firstPayment: 0,
        lastPayment: 0,
        maxPayment: 0,
        avgPayment: 0,
        totalInterest: 0,
        totalPayment: 0,
        totalPrincipalPaid: 0,
        finalBalance: 0,
      };
    }

    let totalInterest = 0;
    let totalPrincipal = 0;
    let totalPayment = 0;
    let maxPayment = 0;

    schedule.forEach(row => {
      totalInterest += row.interest;
      totalPrincipal += row.principal;
      totalPayment += row.payment;
      if (row.payment > maxPayment) maxPayment = row.payment;
    });

    // 반올림 후 값
    const roundedTotalPayment = roundWon(totalPayment);

    // 총 이자는 (총 상환액 - 원금)으로 계산하여 일관성 보장
    // 이렇게 하면 "총 상환액 = 원금 + 총 이자"가 항상 정확히 성립
    const derivedTotalInterest = roundedTotalPayment - originalPrincipal;

    return {
      firstPayment: roundWon(schedule[0].payment),
      lastPayment: roundWon(schedule[schedule.length - 1].payment),
      maxPayment: roundWon(maxPayment),
      avgPayment: roundWon(totalPayment / schedule.length),
      totalInterest: derivedTotalInterest,  // 원금 기준으로 역산
      totalPayment: roundedTotalPayment,
      // 검증용 (실제 합계)
      totalPrincipalPaid: roundWon(totalPrincipal),
      rawInterestSum: roundWon(totalInterest),  // 행 합계 (참고용)
      finalBalance: roundWon(schedule[schedule.length - 1].balance),
    };
  }

  /**
   * 스케줄 불변식 검증
   * @param {Array} schedule - 상환 스케줄 배열
   * @param {number} originalPrincipal - 원래 대출 원금
   * @returns {Object} { isValid, errors, details }
   */
  function validateSchedule(schedule, originalPrincipal) {
    const errors = [];
    const tolerance = CONFIG.toleranceWon;

    if (!schedule || schedule.length === 0) {
      return { isValid: false, errors: ['스케줄이 비어있습니다.'], details: {} };
    }

    const summary = summarizeSchedule(schedule, originalPrincipal);

    // 1. 원금 합계 검증: Σ(principal) == P
    const principalDiff = Math.abs(summary.totalPrincipalPaid - originalPrincipal);
    if (principalDiff > tolerance) {
      errors.push(`원금 합계 불일치: ${summary.totalPrincipalPaid.toLocaleString()}원 ≠ ${originalPrincipal.toLocaleString()}원 (차이: ${principalDiff.toLocaleString()}원)`);
    }

    // 2. 최종 잔액 검증: balance_n == 0
    if (summary.finalBalance !== 0) {
      errors.push(`최종 잔액 ≠ 0: ${summary.finalBalance.toLocaleString()}원`);
    }

    // 3. 행별 검증: payment == principal + interest
    let rowErrors = 0;
    schedule.forEach((row, i) => {
      const expectedPayment = row.principal + row.interest;
      const diff = Math.abs(row.payment - expectedPayment);
      if (diff > tolerance) {
        rowErrors++;
        if (rowErrors <= 3) { // 처음 3개만 표시
          errors.push(`${row.month}회차: 납부액(${row.payment.toLocaleString()}) ≠ 원금(${row.principal.toLocaleString()}) + 이자(${row.interest.toLocaleString()})`);
        }
      }
    });
    if (rowErrors > 3) {
      errors.push(`... 외 ${rowErrors - 3}건의 행 검증 오류`);
    }

    // 4. 총 상환액 검증: totalPayment == principal + totalInterest
    const expectedTotal = originalPrincipal + summary.totalInterest;
    const totalDiff = Math.abs(summary.totalPayment - expectedTotal);
    if (totalDiff > tolerance * schedule.length) { // 행 수만큼 허용
      errors.push(`총 상환액 불일치: ${summary.totalPayment.toLocaleString()}원 ≠ ${expectedTotal.toLocaleString()}원`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      details: {
        principalSum: summary.totalPrincipalPaid,
        interestSum: summary.totalInterest,
        paymentSum: summary.totalPayment,
        finalBalance: summary.finalBalance,
        originalPrincipal,
      }
    };
  }

  // === 원리금균등상환 ===

  /**
   * 원리금균등상환 월 납부액 계산
   * 공식: M = P × [r(1+r)^n] / [(1+r)^n - 1]
   */
  function calcEqualPrincipalInterestPayment(principal, monthlyRate, months) {
    if (months <= 0) return 0;
    if (monthlyRate === 0) return principal / months;

    const compoundFactor = Math.pow(1 + monthlyRate, months);
    if (!isFinite(compoundFactor)) return 0;

    const payment = (principal * monthlyRate * compoundFactor) / (compoundFactor - 1);
    return payment; // 반올림은 스케줄 생성 시
  }

  function generateEPISchedule(principal, monthlyRate, months) {
    const schedule = [];
    let balance = principal;
    const rawPayment = calcEqualPrincipalInterestPayment(principal, monthlyRate, months);

    for (let i = 1; i <= months; i++) {
      const interest = balance * monthlyRate;
      let principalPaid = rawPayment - interest;

      // 마지막 회차: 잔액 전액 상환 (반올림 오차 보정)
      if (i === months) {
        principalPaid = balance;
      }

      const payment = principalPaid + interest;
      balance = Math.max(0, balance - principalPaid);

      schedule.push({
        month: i,
        payment: roundWon(payment),
        principal: roundWon(principalPaid),
        interest: roundWon(interest),
        balance: roundWon(balance),
      });
    }

    return schedule;
  }

  /**
   * 원리금균등상환 계산 (SSOT 패턴)
   */
  function calculateEqualPrincipalInterest(principal, annualRate, months) {
    const monthlyRate = getMonthlyRate(annualRate);
    const schedule = generateEPISchedule(principal, monthlyRate, months);
    const summary = summarizeSchedule(schedule, principal);
    const validation = validateSchedule(schedule, principal);

    return {
      type: REPAYMENT_TYPES.EQUAL_PRINCIPAL_INTEREST,
      typeName: '원리금균등상환',
      principal: roundWon(principal),
      annualRate,
      months,
      graceMonths: 0,
      // 월 납부액 정보 (스케줄에서 추출)
      monthlyPayment: summary.firstPayment,
      firstPayment: summary.firstPayment,
      lastPayment: summary.lastPayment,
      avgPayment: summary.avgPayment,
      maxPayment: summary.maxPayment,
      // 합계 (스케줄에서 추출)
      totalInterest: summary.totalInterest,
      totalPayment: summary.totalPayment,
      // 검증 결과
      validation,
    };
  }

  // === 원금균등상환 ===

  function generateEPSchedule(principal, monthlyRate, months) {
    const schedule = [];
    let balance = principal;
    const monthlyPrincipal = principal / months;

    for (let i = 1; i <= months; i++) {
      const interest = balance * monthlyRate;
      // 마지막 회차: 잔액 전액 상환
      const principalPaid = (i === months) ? balance : monthlyPrincipal;
      const payment = principalPaid + interest;

      balance = Math.max(0, balance - principalPaid);

      schedule.push({
        month: i,
        payment: roundWon(payment),
        principal: roundWon(principalPaid),
        interest: roundWon(interest),
        balance: roundWon(balance),
      });
    }

    return schedule;
  }

  /**
   * 원금균등상환 계산 (SSOT 패턴)
   */
  function calculateEqualPrincipal(principal, annualRate, months) {
    const monthlyRate = getMonthlyRate(annualRate);
    const schedule = generateEPSchedule(principal, monthlyRate, months);
    const summary = summarizeSchedule(schedule, principal);
    const validation = validateSchedule(schedule, principal);

    return {
      type: REPAYMENT_TYPES.EQUAL_PRINCIPAL,
      typeName: '원금균등상환',
      principal: roundWon(principal),
      annualRate,
      months,
      graceMonths: 0,
      monthlyPayment: summary.firstPayment,
      firstPayment: summary.firstPayment,
      lastPayment: summary.lastPayment,
      avgPayment: summary.avgPayment,
      maxPayment: summary.maxPayment,
      totalInterest: summary.totalInterest,
      totalPayment: summary.totalPayment,
      validation,
    };
  }

  // === 만기일시상환 ===

  function generateBulletSchedule(principal, monthlyRate, months) {
    const schedule = [];
    const monthlyInterest = roundWon(principal * monthlyRate);

    for (let i = 1; i <= months; i++) {
      const isLast = i === months;

      schedule.push({
        month: i,
        payment: isLast ? principal + monthlyInterest : monthlyInterest,
        principal: isLast ? principal : 0,
        interest: monthlyInterest,
        balance: isLast ? 0 : principal,
        // 메타데이터
        note: isLast ? '만기일시상환' : '이자만납부',
      });
    }

    return schedule;
  }

  /**
   * 만기일시상환 계산 (SSOT 패턴)
   */
  function calculateBullet(principal, annualRate, months) {
    const monthlyRate = getMonthlyRate(annualRate);
    const schedule = generateBulletSchedule(principal, monthlyRate, months);
    const summary = summarizeSchedule(schedule, principal);
    const validation = validateSchedule(schedule, principal);

    return {
      type: REPAYMENT_TYPES.BULLET,
      typeName: '만기일시상환',
      principal: roundWon(principal),
      annualRate,
      months,
      graceMonths: 0,
      monthlyPayment: summary.firstPayment, // 만기 전 월 납부액 (이자만)
      firstPayment: summary.firstPayment,
      lastPayment: summary.lastPayment,     // 만기 시 원금+이자
      avgPayment: summary.avgPayment,
      maxPayment: summary.maxPayment,
      totalInterest: summary.totalInterest,
      totalPayment: summary.totalPayment,
      validation,
      // 만기일시 특화 정보
      bulletWarning: `만기 시 원금 ${formatKRWReadable(principal)} 일시상환`,
    };
  }

  // === 거치식 상환 ===

  function generateGraceSchedule(principal, monthlyRate, months, graceMonths, repaymentType) {
    const schedule = [];
    let balance = principal;
    const repaymentMonths = months - graceMonths;

    // 거치기간: 이자만 납부
    const graceInterest = roundWon(principal * monthlyRate);
    for (let i = 1; i <= graceMonths; i++) {
      schedule.push({
        month: i,
        payment: graceInterest,
        principal: 0,
        interest: graceInterest,
        balance: principal,
        isGracePeriod: true,
      });
    }

    // 상환기간
    if (repaymentType === 'EPI') {
      const rawPayment = calcEqualPrincipalInterestPayment(principal, monthlyRate, repaymentMonths);
      for (let i = 1; i <= repaymentMonths; i++) {
        const interest = balance * monthlyRate;
        let principalPaid = rawPayment - interest;
        if (i === repaymentMonths) principalPaid = balance;
        const payment = principalPaid + interest;
        balance = Math.max(0, balance - principalPaid);

        schedule.push({
          month: graceMonths + i,
          payment: roundWon(payment),
          principal: roundWon(principalPaid),
          interest: roundWon(interest),
          balance: roundWon(balance),
          isGracePeriod: false,
        });
      }
    } else { // EP
      const monthlyPrincipal = principal / repaymentMonths;
      for (let i = 1; i <= repaymentMonths; i++) {
        const interest = balance * monthlyRate;
        const principalPaid = (i === repaymentMonths) ? balance : monthlyPrincipal;
        const payment = principalPaid + interest;
        balance = Math.max(0, balance - principalPaid);

        schedule.push({
          month: graceMonths + i,
          payment: roundWon(payment),
          principal: roundWon(principalPaid),
          interest: roundWon(interest),
          balance: roundWon(balance),
          isGracePeriod: false,
        });
      }
    }

    return schedule;
  }

  /**
   * 거치식 + 원리금균등상환 계산 (SSOT 패턴)
   */
  function calculateGraceEqualPrincipalInterest(principal, annualRate, months, graceMonths) {
    const monthlyRate = getMonthlyRate(annualRate);
    const schedule = generateGraceSchedule(principal, monthlyRate, months, graceMonths, 'EPI');
    const summary = summarizeSchedule(schedule, principal);
    const validation = validateSchedule(schedule, principal);

    // 거치기간 납부액 (이자만)
    const gracePayment = roundWon(principal * monthlyRate);
    // 상환기간 첫 납부액
    const repaymentFirstPayment = schedule.length > graceMonths ? schedule[graceMonths].payment : 0;

    return {
      type: REPAYMENT_TYPES.GRACE_EPI,
      typeName: '거치식(원리금균등)',
      principal: roundWon(principal),
      annualRate,
      months,
      graceMonths,
      repaymentMonths: months - graceMonths,
      gracePayment,
      monthlyPayment: repaymentFirstPayment,
      firstPayment: summary.firstPayment,
      lastPayment: summary.lastPayment,
      avgPayment: summary.avgPayment,
      maxPayment: summary.maxPayment,
      totalInterest: summary.totalInterest,
      totalPayment: summary.totalPayment,
      validation,
    };
  }

  /**
   * 거치식 + 원금균등상환 계산 (SSOT 패턴)
   */
  function calculateGraceEqualPrincipal(principal, annualRate, months, graceMonths) {
    const monthlyRate = getMonthlyRate(annualRate);
    const schedule = generateGraceSchedule(principal, monthlyRate, months, graceMonths, 'EP');
    const summary = summarizeSchedule(schedule, principal);
    const validation = validateSchedule(schedule, principal);

    const gracePayment = roundWon(principal * monthlyRate);
    const repaymentFirstPayment = schedule.length > graceMonths ? schedule[graceMonths].payment : 0;

    return {
      type: REPAYMENT_TYPES.GRACE_EP,
      typeName: '거치식(원금균등)',
      principal: roundWon(principal),
      annualRate,
      months,
      graceMonths,
      repaymentMonths: months - graceMonths,
      gracePayment,
      monthlyPayment: repaymentFirstPayment,
      firstPayment: summary.firstPayment,
      lastPayment: summary.lastPayment,
      avgPayment: summary.avgPayment,
      maxPayment: summary.maxPayment,
      totalInterest: summary.totalInterest,
      totalPayment: summary.totalPayment,
      validation,
    };
  }

  // === 통합 스케줄 생성 ===

  /**
   * 상환 스케줄 생성 (모든 방식 지원)
   */
  function generateSchedule(type, principal, annualRate, months, graceMonths = 0) {
    const monthlyRate = getMonthlyRate(annualRate);

    switch (type) {
      case REPAYMENT_TYPES.EQUAL_PRINCIPAL_INTEREST:
        return generateEPISchedule(principal, monthlyRate, months);

      case REPAYMENT_TYPES.EQUAL_PRINCIPAL:
        return generateEPSchedule(principal, monthlyRate, months);

      case REPAYMENT_TYPES.BULLET:
        return generateBulletSchedule(principal, monthlyRate, months);

      case REPAYMENT_TYPES.GRACE_EPI:
        return generateGraceSchedule(principal, monthlyRate, months, graceMonths, 'EPI');

      case REPAYMENT_TYPES.GRACE_EP:
        return generateGraceSchedule(principal, monthlyRate, months, graceMonths, 'EP');

      default:
        return generateEPISchedule(principal, monthlyRate, months);
    }
  }

  // === CSV 변환 ===

  function scheduleToCSV(schedule, loanInfo = {}) {
    const headers = ['회차', '납부액(원금+이자)', '원금상환', '이자', '상환후잔액', '비고'];
    const rows = schedule.map(row => [
      row.month,
      row.payment,
      row.principal,
      row.interest,
      row.balance,
      row.isGracePeriod ? '거치기간' : (row.note || '')
    ]);

    // 합계 행 추가
    if (loanInfo.principal) {
      const summary = summarizeSchedule(schedule, loanInfo.principal);
      rows.push([
        '합계',
        summary.totalPayment,
        summary.totalPrincipalPaid,
        summary.totalInterest,
        0,
        ''
      ]);
    }

    const csv = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    // BOM for Korean Excel compatibility
    return '\uFEFF' + csv;
  }

  // === 포맷팅 ===

  /**
   * 원화 포맷팅 (1,234,567원)
   */
  function formatKRW(value) {
    if (!isFinite(value) || isNaN(value)) return '0원';
    return Math.round(value).toLocaleString('ko-KR') + '원';
  }

  /**
   * 원화 포맷팅 - 억/만원 단위 (1억 2,345만원)
   */
  function formatKRWReadable(value) {
    if (!isFinite(value) || isNaN(value)) return '0원';

    const absValue = Math.abs(Math.round(value));
    const sign = value < 0 ? '-' : '';

    if (absValue >= 100000000) {
      const billions = Math.floor(absValue / 100000000);
      const millions = Math.floor((absValue % 100000000) / 10000);
      if (millions > 0) {
        return `${sign}${billions}억 ${millions.toLocaleString('ko-KR')}만원`;
      }
      return `${sign}${billions}억원`;
    } else if (absValue >= 10000) {
      const millions = Math.floor(absValue / 10000);
      const remainder = absValue % 10000;
      if (remainder > 0) {
        return `${sign}${millions.toLocaleString('ko-KR')}만 ${remainder.toLocaleString('ko-KR')}원`;
      }
      return `${sign}${millions.toLocaleString('ko-KR')}만원`;
    }

    return `${sign}${absValue.toLocaleString('ko-KR')}원`;
  }

  /**
   * 퍼센트 포맷팅
   */
  function formatPercent(value, decimals = 2) {
    if (!isFinite(value) || isNaN(value)) return '0%';
    return value.toFixed(decimals) + '%';
  }

  // === 공개 API ===

  return {
    // 상수
    TYPES: REPAYMENT_TYPES,

    // 검증
    validate: validateInputs,
    validateSchedule,
    summarizeSchedule,

    // 통합 계산 함수
    calculate(type, principal, annualRate, months, graceMonths = 0) {
      switch (type) {
        case REPAYMENT_TYPES.EQUAL_PRINCIPAL_INTEREST:
          return calculateEqualPrincipalInterest(principal, annualRate, months);
        case REPAYMENT_TYPES.EQUAL_PRINCIPAL:
          return calculateEqualPrincipal(principal, annualRate, months);
        case REPAYMENT_TYPES.BULLET:
          return calculateBullet(principal, annualRate, months);
        case REPAYMENT_TYPES.GRACE_EPI:
          return calculateGraceEqualPrincipalInterest(principal, annualRate, months, graceMonths);
        case REPAYMENT_TYPES.GRACE_EP:
          return calculateGraceEqualPrincipal(principal, annualRate, months, graceMonths);
        default:
          return calculateEqualPrincipalInterest(principal, annualRate, months);
      }
    },

    // 개별 계산 함수
    equalPrincipalInterest: calculateEqualPrincipalInterest,
    equalPrincipal: calculateEqualPrincipal,
    bullet: calculateBullet,
    graceEPI: calculateGraceEqualPrincipalInterest,
    graceEP: calculateGraceEqualPrincipal,

    // 스케줄
    generateSchedule,
    scheduleToCSV,

    // 포맷팅
    formatKRW,
    formatKRWReadable,
    formatPercent,

    // 설정
    config: CONFIG,
  };
})();

// ES Module export (테스트용)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoanCalculator;
}
