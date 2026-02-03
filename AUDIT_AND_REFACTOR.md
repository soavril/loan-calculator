# 대출 비교 계산기 - 감사 및 리팩토링 계획서

> **버전**: 1.0
> **작성일**: 2025년 2월
> **목적**: 계산 로직 정확성 검증 및 개선

---

## 목차

- [A) Executive Diagnosis (PM/UX 관점)](#a-executive-diagnosis)
- [B) 정확한 공식 및 예상 동작 (QA/Analyst 관점)](#b-정확한-공식-및-예상-동작)
- [C) 코드 리팩토링 계획 (Frontend Engineer 관점)](#c-코드-리팩토링-계획)
- [D) UI/UX 개선 사항 (UX/UI 관점)](#d-uiux-개선-사항)
- [E) SEO/신뢰도 개선 (Growth 관점)](#e-seo신뢰도-개선)
- [F) QA 테스트 계획 (QA/Analyst 관점)](#f-qa-테스트-계획)
- [Patch Checklist](#patch-checklist)

---

## A) Executive Diagnosis

### 발견된 문제점

#### 1. 만기일시상환 스케줄 표시 혼란 (Critical)

**현상**:
- 만기일시상환 선택 시 상환 스케줄 테이블에서 "원금" 컬럼이 359회차까지 0원, 360회차에 3억원 표시
- 사용자 관점에서 "왜 원금이 계속 0인가?" 혼란 유발
- "만기에 원금 일시상환"이라는 핵심 정보가 명확히 전달되지 않음

**영향**:
- 사용자 신뢰도 저하 ("계산기가 고장났나?")
- 이탈률 증가
- 부정적 리뷰/피드백 리스크

#### 2. Summary와 Schedule 간 불일치 가능성

**현상**:
- Summary 카드의 `totalInterest`는 공식 계산
- Schedule 테이블의 이자 합계는 행별 누적
- 반올림 오차로 인해 수천 원 차이 발생 가능

**영향**:
- "합계가 맞지 않는다"는 사용자 불만
- 계산기 신뢰도 저하

#### 3. 거치기간 UI 명확성 부족

**현상**:
- 거치기간 중 "이자만 납부"라는 표시가 스케줄 테이블에서 잘 드러나지 않음
- 거치기간 종료 후 납부액 급증에 대한 사전 경고 없음

### 우선순위별 수정 필요 사항

| 우선순위 | 항목 | 영향도 |
|---------|------|--------|
| P0 | 만기일시상환 스케줄 UX 개선 (경고 추가) | 신뢰도 |
| P0 | Summary-Schedule 합계 일치 검증 추가 | 정확성 |
| P1 | 컬럼 헤더 명확화 ("납부액 = 원금 + 이자") | 이해도 |
| P1 | 거치기간 시각적 구분 강화 | 이해도 |
| P2 | 상환표 페이지네이션/토글 | 성능/UX |

---

## B) 정확한 공식 및 예상 동작

### 기본 전제 조건

```
P = 대출원금 (Principal)
r = 연 이자율 (Annual Rate, %)
R = 월 이자율 = r / 100 / 12
n = 총 대출기간 (개월)
g = 거치기간 (개월, 기본값 0)
```

### 이자 계산 방식 (Convention)

**본 계산기 적용 방식: 월할 단리**
- 월 이자 = 잔액 × (연이자율 / 12)
- 일할 계산 미적용 (은행별 상이)
- 복리 미적용

---

### B-1. 원리금균등상환 (Annuity / Equal Total Payment)

#### 공식

**월 납부액 (M)**:
```
M = P × [R(1+R)^n] / [(1+R)^n - 1]

R = 0일 경우: M = P / n
```

**k회차 이자**:
```
Interest_k = Balance_(k-1) × R
```

**k회차 원금**:
```
Principal_k = M - Interest_k
```

**k회차 후 잔액**:
```
Balance_k = Balance_(k-1) - Principal_k
```

#### 예상 동작

| 특성 | 값 |
|------|-----|
| 월 납부액 | 고정 (마지막 회차 미세 조정) |
| 원금 비중 | 점점 증가 |
| 이자 비중 | 점점 감소 |
| 총 이자 | M × n - P |

#### 마지막 회차 처리

```javascript
if (i === months) {
  principalPaid = balance; // 잔액 전액 상환
  payment = principalPaid + interest;
}
```

#### 불변식 (Invariants)

- ✅ Σ(Principal_k) = P
- ✅ Balance_n = 0
- ✅ Payment_k = Principal_k + Interest_k (모든 k)
- ✅ Total Payment = P + Total Interest

---

### B-2. 원금균등상환 (Equal Principal)

#### 공식

**월 원금 (고정)**:
```
MonthlyPrincipal = P / n
```

**k회차 이자**:
```
Interest_k = Balance_(k-1) × R
          = [P - MonthlyPrincipal × (k-1)] × R
```

**k회차 납부액**:
```
Payment_k = MonthlyPrincipal + Interest_k
```

#### 예상 동작

| 특성 | 값 |
|------|-----|
| 월 원금 | 고정 |
| 월 납부액 | 점점 감소 |
| 첫 납부액 | 최대 |
| 마지막 납부액 | 최소 |
| 총 이자 | P × R × (n+1) / 2 |

#### 마지막 회차 처리

```javascript
if (i === months) {
  principalPaid = balance; // 반올림 오차 보정
}
```

#### 불변식

- ✅ Σ(Principal_k) = P
- ✅ Balance_n = 0
- ✅ Payment_k = Principal_k + Interest_k

---

### B-3. 만기일시상환 (Interest-Only / Bullet)

#### 공식

**월 납부액 (1 ~ n-1 회차)**:
```
Payment = P × R (이자만)
Principal = 0
```

**마지막 회차 (n)**:
```
Payment = P + (P × R) = P × (1 + R)
Principal = P (원금 전액)
Interest = P × R
```

**총 이자**:
```
TotalInterest = P × R × n
```

#### 예상 동작

| 회차 | 납부액 | 원금 | 이자 | 잔액 |
|------|--------|------|------|------|
| 1 | P×R | 0 | P×R | P |
| 2 | P×R | 0 | P×R | P |
| ... | P×R | 0 | P×R | P |
| n | P×(1+R) | P | P×R | 0 |

#### 예시 (P=3억, r=4.5%, n=360개월)

```
R = 4.5 / 100 / 12 = 0.00375
월 이자 = 300,000,000 × 0.00375 = 1,125,000원

회차 1~359: 납부액 1,125,000원, 원금 0원, 잔액 3억원
회차 360: 납부액 301,125,000원, 원금 3억원, 잔액 0원

총 이자 = 1,125,000 × 360 = 405,000,000원
총 상환액 = 300,000,000 + 405,000,000 = 705,000,000원
```

#### 불변식

- ✅ Σ(Principal_k) = P (오직 마지막 회차에서 P)
- ✅ Balance_n = 0
- ✅ Payment_k = Principal_k + Interest_k

---

### B-4. 거치식 상환 (Grace Period)

#### 거치 정책: 이자 납부형 (Interest-Paying Grace)

거치기간 동안:
- 원금 상환: 없음
- 이자 납부: 있음 (P × R 매월)
- 잔액: P 유지

#### 공식

**거치기간 (1 ~ g 회차)**:
```
Payment = P × R
Principal = 0
Interest = P × R
Balance = P
```

**상환기간 (g+1 ~ n 회차)**:
```
남은 기간 = n - g
원리금균등 또는 원금균등 공식 적용
원금 = P (거치 중 상환 없었으므로)
```

#### 거치 후 원리금균등 예시

```
P = 3억, r = 4.5%, n = 360개월, g = 24개월

거치기간 (1~24):
  납부액 = 1,125,000원/월
  거치 이자 합계 = 1,125,000 × 24 = 27,000,000원

상환기간 (25~360, 336개월):
  M = 3억 × [0.00375 × 1.00375^336] / [1.00375^336 - 1]
  M ≈ 1,553,000원/월

총 이자 = 27,000,000 + (1,553,000 × 336 - 3억) ≈ 248,808,000원
```

---

### 반올림 규칙

| 항목 | 규칙 |
|------|------|
| 월 납부액 | Math.round() - 원 단위 반올림 |
| 이자 | 계산 중 소수점 유지, 표시 시 반올림 |
| 마지막 회차 원금 | 잔액 전액 (오차 보정) |

---

## C) 코드 리팩토링 계획

### C-1. 표준 데이터 모델

```typescript
// 스케줄 행 타입
interface ScheduleRow {
  period: number;       // 회차 (1-based)
  payment: number;      // 납부액 (원)
  principal: number;    // 원금 상환액 (원)
  interest: number;     // 이자 (원)
  balance: number;      // 상환 후 잔액 (원)
  isGracePeriod?: boolean;  // 거치기간 여부
}

// 대출 요약 타입
interface LoanSummary {
  type: string;
  typeName: string;
  principal: number;
  annualRate: number;
  months: number;
  graceMonths: number;
  // 납부액 정보
  firstPayment: number;
  lastPayment: number;
  maxPayment: number;
  avgPayment: number;
  // 합계
  totalInterest: number;
  totalPayment: number;
}

// 검증 결과 타입
interface ValidationResult {
  isValid: boolean;
  principalSum: number;
  interestSum: number;
  finalBalance: number;
  errors: string[];
}
```

### C-2. 순수 함수 구조

```javascript
// === 핵심 계산 함수 ===

/**
 * 상환 스케줄 생성 (단일 진입점)
 */
function generateSchedule(params) {
  const { type, principal, annualRate, months, graceMonths = 0 } = params;
  const monthlyRate = annualRate / 100 / 12;

  switch (type) {
    case 'equalPrincipalInterest':
      return generateEPISchedule(principal, monthlyRate, months);
    case 'equalPrincipal':
      return generateEPSchedule(principal, monthlyRate, months);
    case 'bullet':
      return generateBulletSchedule(principal, monthlyRate, months);
    case 'graceEPI':
      return generateGraceSchedule(principal, monthlyRate, months, graceMonths, 'EPI');
    case 'graceEP':
      return generateGraceSchedule(principal, monthlyRate, months, graceMonths, 'EP');
  }
}

/**
 * 스케줄에서 요약 정보 추출 (Single Source of Truth)
 */
function summarizeSchedule(schedule, principal) {
  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
  const totalPrincipal = schedule.reduce((sum, row) => sum + row.principal, 0);
  const totalPayment = schedule.reduce((sum, row) => sum + row.payment, 0);

  return {
    firstPayment: schedule[0]?.payment || 0,
    lastPayment: schedule[schedule.length - 1]?.payment || 0,
    maxPayment: Math.max(...schedule.map(r => r.payment)),
    avgPayment: totalPayment / schedule.length,
    totalInterest: Math.round(totalInterest),
    totalPayment: Math.round(totalPayment),
    // 검증용
    _principalSum: Math.round(totalPrincipal),
    _interestSum: Math.round(totalInterest),
    _finalBalance: schedule[schedule.length - 1]?.balance || 0,
  };
}

/**
 * 불변식 검증
 */
function validateSchedule(schedule, originalPrincipal) {
  const summary = summarizeSchedule(schedule, originalPrincipal);
  const errors = [];

  // 원금 합계 검증
  if (Math.abs(summary._principalSum - originalPrincipal) > 1) {
    errors.push(`원금 합계 불일치: ${summary._principalSum} ≠ ${originalPrincipal}`);
  }

  // 최종 잔액 검증
  if (summary._finalBalance !== 0) {
    errors.push(`최종 잔액 ≠ 0: ${summary._finalBalance}`);
  }

  // 행별 검증: payment = principal + interest
  schedule.forEach((row, i) => {
    const expectedPayment = row.principal + row.interest;
    if (Math.abs(row.payment - expectedPayment) > 1) {
      errors.push(`${row.period}회차: 납부액(${row.payment}) ≠ 원금(${row.principal}) + 이자(${row.interest})`);
    }
  });

  return {
    isValid: errors.length === 0,
    principalSum: summary._principalSum,
    interestSum: summary._interestSum,
    finalBalance: summary._finalBalance,
    errors,
  };
}
```

### C-3. 만기일시상환 수정된 로직

```javascript
function generateBulletSchedule(principal, monthlyRate, months) {
  const schedule = [];
  const monthlyInterest = Math.round(principal * monthlyRate);

  for (let period = 1; period <= months; period++) {
    const isLastPeriod = period === months;

    schedule.push({
      period,
      payment: isLastPeriod ? principal + monthlyInterest : monthlyInterest,
      principal: isLastPeriod ? principal : 0,
      interest: monthlyInterest,
      balance: isLastPeriod ? 0 : principal,
      // 메타데이터
      note: isLastPeriod ? '만기일시상환' : '이자만 납부',
    });
  }

  return schedule;
}
```

### C-4. Summary와 Schedule 통합

**현재 문제**: Summary 계산과 Schedule 생성이 별도 로직

**해결책**: Schedule 생성 후 Summary 추출

```javascript
// Before (중복 로직)
function calculateBullet(principal, annualRate, months) {
  // 별도 계산...
  return { totalInterest: monthlyInterest * months, ... };
}

// After (Single Source of Truth)
function calculateBullet(principal, annualRate, months) {
  const monthlyRate = annualRate / 100 / 12;
  const schedule = generateBulletSchedule(principal, monthlyRate, months);
  const summary = summarizeSchedule(schedule, principal);

  return {
    type: 'bullet',
    typeName: '만기일시상환',
    principal,
    annualRate,
    months,
    ...summary,
    schedule, // 옵션: 스케줄도 포함
  };
}
```

---

## D) UI/UX 개선 사항

### D-1. 테이블 헤더 명확화

**현재**:
```
| 회차 | 납부액 | 원금 | 이자 | 잔액 |
```

**개선**:
```
| 회차 | 납부액 (=원금+이자) | 원금 상환 | 이자 | 상환 후 잔액 |
```

### D-2. 만기일시상환 경고 배너

```html
<div class="warning-banner warning-bullet">
  <span class="warning-icon">⚠️</span>
  <p>
    <strong>만기일시상환</strong>: 대출 기간 동안 이자만 납부하고,
    만기에 원금 <strong>전액(3억원)</strong>을 일시 상환합니다.
  </p>
</div>
```

### D-3. 검증 배지 추가

```html
<div class="validation-badge valid">
  ✓ 합계 검증 완료
  <span class="badge-detail">원금: 300,000,000원 / 잔액: 0원</span>
</div>

<!-- 실패 시 -->
<div class="validation-badge invalid">
  ✗ 합계 검증 실패
  <span class="badge-detail">원금 차이: 1,234원</span>
</div>
```

### D-4. 상환표 페이지네이션

```html
<div class="schedule-controls">
  <button class="btn-toggle active" data-rows="12">첫 12개월</button>
  <button class="btn-toggle" data-rows="60">5년</button>
  <button class="btn-toggle" data-rows="all">전체 (360개월)</button>
</div>
```

**구현**:
```javascript
const DISPLAY_MODES = {
  FIRST_12: 12,
  FIRST_60: 60,
  ALL: Infinity,
};

function renderScheduleTable(schedule, displayMode = DISPLAY_MODES.FIRST_12) {
  const visibleRows = schedule.slice(0, displayMode);
  const hasMore = schedule.length > visibleRows.length;

  // 렌더링...

  if (hasMore) {
    // "더 보기" 또는 "전체 보기" 버튼 표시
  }
}
```

### D-5. 거치기간 시각적 구분

```css
/* 거치기간 행 스타일 */
.schedule-table tbody tr.grace-period {
  background-color: #fff8e1;
}

.schedule-table tbody tr.grace-period td:first-child::after {
  content: " (거치)";
  font-size: 0.75rem;
  color: #f57c00;
}
```

### D-6. CSV 컬럼 일치

```javascript
function scheduleToCSV(schedule, loanInfo) {
  // 헤더는 UI 테이블과 동일
  const headers = [
    '회차',
    '납부액(원금+이자)',
    '원금상환',
    '이자',
    '상환후잔액',
    '비고'
  ];

  const rows = schedule.map(row => [
    row.period,
    row.payment,
    row.principal,
    row.interest,
    row.balance,
    row.isGracePeriod ? '거치기간' : (row.note || '')
  ]);

  // 합계 행 추가
  const totals = summarizeSchedule(schedule, loanInfo.principal);
  rows.push([
    '합계',
    totals.totalPayment,
    loanInfo.principal,
    totals.totalInterest,
    0,
    ''
  ]);

  return '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
}
```

---

## E) SEO/신뢰도 개선

### E-1. 만기일시상환 전용 FAQ

```html
<details>
  <summary>만기일시상환이란 무엇인가요?</summary>
  <p>
    만기일시상환은 대출 기간 동안 <strong>이자만 납부</strong>하고,
    대출 만기일에 <strong>원금 전액을 일시 상환</strong>하는 방식입니다.
    <br><br>
    <strong>장점</strong>: 매월 납부 부담이 적음<br>
    <strong>단점</strong>: 총 이자 부담이 가장 큼, 만기 시 목돈 필요
  </p>
</details>

<details>
  <summary>만기일시상환 시 총 이자가 왜 이렇게 많나요?</summary>
  <p>
    만기일시상환은 원금이 줄지 않아 매월 동일한 이자가 발생합니다.
    <br><br>
    예: 3억원, 연 4.5%, 30년 → 월 이자 약 112만원 × 360개월 = <strong>총 이자 약 4억원</strong>
    <br><br>
    반면 원리금균등은 원금이 점점 줄어 총 이자가 약 2.5억원 수준입니다.
  </p>
</details>
```

### E-2. 은행 계산 차이 안내 강화

```html
<div class="info-box">
  <h4>은행/대출상품마다 결과가 다를 수 있는 이유</h4>
  <ul>
    <li><strong>이자 계산 방식</strong>: 일할 계산 vs 월할 계산</li>
    <li><strong>상환일</strong>: 매월 특정일 vs 대출 실행일 기준</li>
    <li><strong>수수료</strong>: 중도상환수수료, 인지대, 보증료 등 미반영</li>
    <li><strong>반올림</strong>: 원 단위 vs 10원 단위 vs 절사/반올림</li>
  </ul>
  <p class="info-note">
    본 계산기는 <strong>월할 단리, 원 단위 반올림</strong> 기준입니다.
    실제 대출 조건은 해당 금융기관에서 확인하세요.
  </p>
</div>
```

### E-3. 신뢰 구축 문구

**기피할 문구**:
- ❌ "정확하지 않을 수 있습니다"
- ❌ "책임지지 않습니다"

**권장 문구**:
- ✅ "표준 금융 공식을 사용합니다"
- ✅ "참고용 정보이며, 최종 확인은 금융기관에서"
- ✅ "계산 공식을 투명하게 공개합니다"

---

## F) QA 테스트 계획

### F-1. 단위 테스트 케이스

#### 테스트 1: 원리금균등 (소액, 단기)

```javascript
test('원리금균등 - 100만원, 12개월, 12%', () => {
  const result = calculateEqualPrincipalInterest(1000000, 12, 12);
  // 월 이자율 = 1%
  // 월 납부액 ≈ 88,849원
  expect(result.monthlyPayment).toBeCloseTo(88849, -1);
  expect(result.totalInterest).toBeCloseTo(66188, -2);
  expect(result.totalPayment).toBeCloseTo(1066188, -2);
});
```

#### 테스트 2: 원금균등 (감소하는 이자 확인)

```javascript
test('원금균등 - 이자 감소 확인', () => {
  const schedule = generateEPSchedule(1200000, 0.01, 12);

  // 월 원금 = 100,000원
  expect(schedule[0].principal).toBe(100000);
  expect(schedule[11].principal).toBe(100000);

  // 이자 감소 확인
  expect(schedule[0].interest).toBe(12000);   // 120만 × 1%
  expect(schedule[1].interest).toBe(11000);   // 110만 × 1%
  expect(schedule[11].interest).toBe(1000);   // 10만 × 1%
});
```

#### 테스트 3: 만기일시상환

```javascript
test('만기일시상환 - 원금 0 + 마지막 회차 원금 전액', () => {
  const schedule = generateBulletSchedule(300000000, 0.00375, 360);

  // 1~359회차: 원금 = 0
  for (let i = 0; i < 359; i++) {
    expect(schedule[i].principal).toBe(0);
    expect(schedule[i].interest).toBe(1125000);
    expect(schedule[i].balance).toBe(300000000);
  }

  // 360회차: 원금 = 3억
  expect(schedule[359].principal).toBe(300000000);
  expect(schedule[359].interest).toBe(1125000);
  expect(schedule[359].payment).toBe(301125000);
  expect(schedule[359].balance).toBe(0);
});
```

#### 테스트 4: 0% 이자율

```javascript
test('0% 이자율 - 원금만 분할 상환', () => {
  const result = calculateEqualPrincipalInterest(1200000, 0, 12);

  expect(result.monthlyPayment).toBe(100000);
  expect(result.totalInterest).toBe(0);
  expect(result.totalPayment).toBe(1200000);
});
```

#### 테스트 5: 1개월 대출

```javascript
test('1개월 대출', () => {
  const result = calculateEqualPrincipalInterest(1000000, 12, 1);

  // 월 이자 = 10,000원
  expect(result.monthlyPayment).toBe(1010000);
  expect(result.totalInterest).toBe(10000);
});
```

#### 테스트 6: 대액 스트레스 테스트

```javascript
test('100억원, 50년 대출 - 오버플로우 없음', () => {
  const result = calculateEqualPrincipalInterest(10000000000, 5, 600);

  expect(result.monthlyPayment).toBeGreaterThan(0);
  expect(result.totalInterest).toBeGreaterThan(0);
  expect(isFinite(result.totalPayment)).toBe(true);
});
```

### F-2. 불변식 테스트 (Property-Based)

```javascript
test('불변식: 원금 합계 = 원래 원금', () => {
  const testCases = [
    { principal: 100000000, rate: 4.5, months: 360, type: 'equalPrincipalInterest' },
    { principal: 100000000, rate: 4.5, months: 360, type: 'equalPrincipal' },
    { principal: 100000000, rate: 4.5, months: 360, type: 'bullet' },
    { principal: 100000000, rate: 4.5, months: 360, type: 'graceEPI', grace: 24 },
  ];

  testCases.forEach(tc => {
    const schedule = generateSchedule(tc);
    const validation = validateSchedule(schedule, tc.principal);

    expect(validation.isValid).toBe(true);
    expect(validation.finalBalance).toBe(0);
    expect(Math.abs(validation.principalSum - tc.principal)).toBeLessThan(10);
  });
});
```

### F-3. UI 매핑 테스트

```javascript
test('CSV 컬럼 순서 = 테이블 컬럼 순서', () => {
  const schedule = generateBulletSchedule(100000000, 0.00375, 12);
  const csv = scheduleToCSV(schedule, { principal: 100000000 });
  const lines = csv.split('\n');
  const headers = lines[0].split(',');

  expect(headers).toEqual([
    '회차',
    '납부액(원금+이자)',
    '원금상환',
    '이자',
    '상환후잔액',
    '비고'
  ]);
});
```

---

## Patch Checklist

### 계산 로직

- [ ] 만기일시 월 원금 = 0 확인 (1 ~ n-1 회차)
- [ ] 만기일시 마지막 회차 원금 = P 확인
- [ ] Summary totals == Schedule totals (Single Source of Truth)
- [ ] 불변식 검증 함수 추가
- [ ] 0% 이자율 엣지 케이스 통과
- [ ] 1개월 대출 엣지 케이스 통과

### UI

- [ ] 테이블 컬럼 헤더 명확화 ("납부액 = 원금 + 이자")
- [ ] 만기일시상환 경고 배너 추가
- [ ] 검증 배지 UI 추가
- [ ] 거치기간 행 시각적 구분 (배경색)
- [ ] 상환표 페이지네이션/토글 (12개월/전체)

### CSV

- [ ] CSV 컬럼 = 테이블 컬럼 일치
- [ ] CSV 합계 행 추가
- [ ] UTF-8 BOM 유지 (한글 엑셀 호환)

### 테스트

- [ ] 단위 테스트 6종 작성
- [ ] 불변식 테스트 작성
- [ ] UI 매핑 테스트 작성

### 문서/SEO

- [ ] 만기일시상환 FAQ 추가
- [ ] "은행 계산 차이" 안내 강화
- [ ] 면책 문구 신뢰 톤으로 수정

---

**문서 끝**
