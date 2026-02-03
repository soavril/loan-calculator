/**
 * 대출 비교 계산기 - 계산 로직 모듈
 *
 * 지원 상환방식:
 * 1. 원리금균등상환 (Equal Principal and Interest)
 * 2. 원금균등상환 (Equal Principal)
 * 3. 만기일시상환 (Bullet Repayment)
 * 4. 거치식 (Grace Period + Amortization)
 *
 * 공식 출처: 한국주택금융공사, 시중은행 대출 계산 기준
 */

const LoanCalculator = (function() {
  'use strict';

  // === 설정 ===
  const CONFIG = {
    // 반올림: 원 단위
    roundToWon: true,
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
    return roundWon(payment);
  }

  /**
   * 원리금균등상환 전체 계산
   */
  function calculateEqualPrincipalInterest(principal, annualRate, months) {
    const monthlyRate = getMonthlyRate(annualRate);
    const monthlyPayment = calcEqualPrincipalInterestPayment(principal, monthlyRate, months);
    const totalPayment = monthlyPayment * months;
    const totalInterest = totalPayment - principal;

    return {
      type: REPAYMENT_TYPES.EQUAL_PRINCIPAL_INTEREST,
      typeName: '원리금균등상환',
      principal: roundWon(principal),
      annualRate,
      months,
      monthlyPayment: roundWon(monthlyPayment),
      firstPayment: roundWon(monthlyPayment),
      lastPayment: roundWon(monthlyPayment),
      avgPayment: roundWon(monthlyPayment),
      maxPayment: roundWon(monthlyPayment),
      totalInterest: roundWon(totalInterest),
      totalPayment: roundWon(totalPayment),
    };
  }

  // === 원금균등상환 ===

  /**
   * 원금균등상환 k회차 납부액 계산
   * 월 원금 = P / n
   * k회차 이자 = (P - 월원금 × (k-1)) × r
   */
  function calcEqualPrincipalPaymentAt(principal, monthlyRate, months, k) {
    const monthlyPrincipal = principal / months;
    const remainingPrincipal = principal - (monthlyPrincipal * (k - 1));
    const interest = remainingPrincipal * monthlyRate;
    return roundWon(monthlyPrincipal + interest);
  }

  /**
   * 원금균등상환 전체 계산
   */
  function calculateEqualPrincipal(principal, annualRate, months) {
    const monthlyRate = getMonthlyRate(annualRate);
    const monthlyPrincipal = principal / months;

    // 첫 회차 납부액 (최대)
    const firstPayment = calcEqualPrincipalPaymentAt(principal, monthlyRate, months, 1);
    // 마지막 회차 납부액 (최소)
    const lastPayment = calcEqualPrincipalPaymentAt(principal, monthlyRate, months, months);

    // 총 이자 계산: P × r × (n+1) / 2
    const totalInterest = principal * monthlyRate * (months + 1) / 2;
    const totalPayment = principal + totalInterest;
    const avgPayment = totalPayment / months;

    return {
      type: REPAYMENT_TYPES.EQUAL_PRINCIPAL,
      typeName: '원금균등상환',
      principal: roundWon(principal),
      annualRate,
      months,
      monthlyPayment: roundWon(firstPayment), // 초기 납부액 표시
      firstPayment: roundWon(firstPayment),
      lastPayment: roundWon(lastPayment),
      avgPayment: roundWon(avgPayment),
      maxPayment: roundWon(firstPayment),
      totalInterest: roundWon(totalInterest),
      totalPayment: roundWon(totalPayment),
    };
  }

  // === 만기일시상환 ===

  /**
   * 만기일시상환 계산
   * 월 납부액 = P × r (이자만)
   * 만기 시 = P + (P × r)
   */
  function calculateBullet(principal, annualRate, months) {
    const monthlyRate = getMonthlyRate(annualRate);
    const monthlyInterest = principal * monthlyRate;
    const totalInterest = monthlyInterest * months;
    const finalPayment = principal + monthlyInterest;
    const totalPayment = monthlyInterest * (months - 1) + finalPayment;

    return {
      type: REPAYMENT_TYPES.BULLET,
      typeName: '만기일시상환',
      principal: roundWon(principal),
      annualRate,
      months,
      monthlyPayment: roundWon(monthlyInterest), // 만기 전 월 납부액
      firstPayment: roundWon(monthlyInterest),
      lastPayment: roundWon(finalPayment),       // 만기 시 원금+이자
      avgPayment: roundWon(totalPayment / months),
      maxPayment: roundWon(finalPayment),
      totalInterest: roundWon(totalInterest),
      totalPayment: roundWon(totalPayment),
    };
  }

  // === 거치식 상환 ===

  /**
   * 거치식 + 원리금균등상환 계산
   */
  function calculateGraceEqualPrincipalInterest(principal, annualRate, months, graceMonths) {
    const monthlyRate = getMonthlyRate(annualRate);
    const repaymentMonths = months - graceMonths;

    // 거치기간: 이자만 납부
    const gracePayment = principal * monthlyRate;
    const graceInterest = gracePayment * graceMonths;

    // 상환기간: 원리금균등
    const repaymentPayment = calcEqualPrincipalInterestPayment(principal, monthlyRate, repaymentMonths);
    const repaymentTotal = repaymentPayment * repaymentMonths;
    const repaymentInterest = repaymentTotal - principal;

    const totalInterest = graceInterest + repaymentInterest;
    const totalPayment = principal + totalInterest;

    return {
      type: REPAYMENT_TYPES.GRACE_EPI,
      typeName: '거치식(원리금균등)',
      principal: roundWon(principal),
      annualRate,
      months,
      graceMonths,
      repaymentMonths,
      gracePayment: roundWon(gracePayment),
      monthlyPayment: roundWon(repaymentPayment), // 상환기간 월 납부액
      firstPayment: roundWon(gracePayment),       // 거치기간 첫 납부액
      lastPayment: roundWon(repaymentPayment),
      avgPayment: roundWon(totalPayment / months),
      maxPayment: roundWon(repaymentPayment),
      totalInterest: roundWon(totalInterest),
      totalPayment: roundWon(totalPayment),
    };
  }

  /**
   * 거치식 + 원금균등상환 계산
   */
  function calculateGraceEqualPrincipal(principal, annualRate, months, graceMonths) {
    const monthlyRate = getMonthlyRate(annualRate);
    const repaymentMonths = months - graceMonths;

    // 거치기간: 이자만 납부
    const gracePayment = principal * monthlyRate;
    const graceInterest = gracePayment * graceMonths;

    // 상환기간: 원금균등
    const monthlyPrincipal = principal / repaymentMonths;
    const firstRepayment = monthlyPrincipal + (principal * monthlyRate);
    const lastRepayment = monthlyPrincipal + (monthlyPrincipal * monthlyRate);
    const repaymentInterest = principal * monthlyRate * (repaymentMonths + 1) / 2;

    const totalInterest = graceInterest + repaymentInterest;
    const totalPayment = principal + totalInterest;

    return {
      type: REPAYMENT_TYPES.GRACE_EP,
      typeName: '거치식(원금균등)',
      principal: roundWon(principal),
      annualRate,
      months,
      graceMonths,
      repaymentMonths,
      gracePayment: roundWon(gracePayment),
      monthlyPayment: roundWon(firstRepayment), // 상환기간 첫 납부액
      firstPayment: roundWon(gracePayment),     // 거치기간 첫 납부액
      lastPayment: roundWon(lastRepayment),
      avgPayment: roundWon(totalPayment / months),
      maxPayment: roundWon(firstRepayment),
      totalInterest: roundWon(totalInterest),
      totalPayment: roundWon(totalPayment),
    };
  }

  // === 상환 스케줄 생성 ===

  /**
   * 상환 스케줄 생성 (모든 방식 지원)
   * @returns {Array} [{ month, payment, principal, interest, balance }]
   */
  function generateSchedule(type, principal, annualRate, months, graceMonths = 0) {
    const monthlyRate = getMonthlyRate(annualRate);
    const schedule = [];
    let balance = principal;

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
        return [];
    }
  }

  function generateEPISchedule(principal, monthlyRate, months) {
    const schedule = [];
    let balance = principal;
    const payment = calcEqualPrincipalInterestPayment(principal, monthlyRate, months);

    for (let i = 1; i <= months; i++) {
      const interest = balance * monthlyRate;
      let principalPaid = payment - interest;

      // 마지막 회차 조정
      if (i === months) {
        principalPaid = balance;
      }

      balance = Math.max(0, balance - principalPaid);

      schedule.push({
        month: i,
        payment: roundWon(i === months ? principalPaid + interest : payment),
        principal: roundWon(principalPaid),
        interest: roundWon(interest),
        balance: roundWon(balance),
      });
    }

    return schedule;
  }

  function generateEPSchedule(principal, monthlyRate, months) {
    const schedule = [];
    let balance = principal;
    const monthlyPrincipal = principal / months;

    for (let i = 1; i <= months; i++) {
      const interest = balance * monthlyRate;
      const principalPaid = i === months ? balance : monthlyPrincipal;
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

  function generateBulletSchedule(principal, monthlyRate, months) {
    const schedule = [];
    const monthlyInterest = principal * monthlyRate;

    for (let i = 1; i <= months; i++) {
      const isLast = i === months;
      schedule.push({
        month: i,
        payment: roundWon(isLast ? principal + monthlyInterest : monthlyInterest),
        principal: roundWon(isLast ? principal : 0),
        interest: roundWon(monthlyInterest),
        balance: roundWon(isLast ? 0 : principal),
      });
    }

    return schedule;
  }

  function generateGraceSchedule(principal, monthlyRate, months, graceMonths, repaymentType) {
    const schedule = [];
    let balance = principal;
    const repaymentMonths = months - graceMonths;

    // 거치기간
    const graceInterest = principal * monthlyRate;
    for (let i = 1; i <= graceMonths; i++) {
      schedule.push({
        month: i,
        payment: roundWon(graceInterest),
        principal: 0,
        interest: roundWon(graceInterest),
        balance: roundWon(principal),
        isGracePeriod: true,
      });
    }

    // 상환기간
    if (repaymentType === 'EPI') {
      const payment = calcEqualPrincipalInterestPayment(principal, monthlyRate, repaymentMonths);
      for (let i = 1; i <= repaymentMonths; i++) {
        const interest = balance * monthlyRate;
        let principalPaid = payment - interest;
        if (i === repaymentMonths) principalPaid = balance;
        balance = Math.max(0, balance - principalPaid);

        schedule.push({
          month: graceMonths + i,
          payment: roundWon(i === repaymentMonths ? principalPaid + interest : payment),
          principal: roundWon(principalPaid),
          interest: roundWon(interest),
          balance: roundWon(balance),
          isGracePeriod: false,
        });
      }
    } else {
      const monthlyPrincipal = principal / repaymentMonths;
      for (let i = 1; i <= repaymentMonths; i++) {
        const interest = balance * monthlyRate;
        const principalPaid = i === repaymentMonths ? balance : monthlyPrincipal;
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

  // === CSV 변환 ===

  function scheduleToCSV(schedule, loanName = '대출') {
    const headers = ['회차', '납부액', '원금', '이자', '잔액', '비고'];
    const rows = schedule.map(row => [
      row.month,
      row.payment,
      row.principal,
      row.interest,
      row.balance,
      row.isGracePeriod ? '거치기간' : ''
    ]);

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

    // 계산
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

// ES Module export (Phase 2 테스트용)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoanCalculator;
}
