/**
 * Interest calculation engine for LabCoop Microbanking
 */

/**
 * Calculate total interest using flat rate method
 * Interest = Principal × Rate × Term
 */
function calculateFlatInterest(principal, rate, termMonths) {
  return principal * rate * (termMonths / 12);
}

/**
 * Calculate total interest using diminishing balance method
 * Uses simple diminishing: interest on remaining principal each month
 */
function calculateDiminishingInterest(principal, rate, termMonths) {
  const monthlyRate = rate / 12;
  let totalInterest = 0;
  let remaining = principal;
  const monthlyPrincipal = principal / termMonths;

  for (let i = 0; i < termMonths; i++) {
    const monthInterest = remaining * monthlyRate;
    totalInterest += monthInterest;
    remaining -= monthlyPrincipal;
  }

  return totalInterest;
}

/**
 * Calculate monthly amortization
 */
function calculateMonthlyAmortization(totalPayable, termMonths) {
  return Math.round((totalPayable / termMonths) * 100) / 100;
}

/**
 * Generate full amortization schedule
 * Returns array of { month, beginningBalance, principalPortion, interestPortion, totalPayment, endingBalance }
 */
function generateAmortizationSchedule(principal, rate, termMonths, interestType) {
  const monthlyRate = rate / 12;
  const schedule = [];
  let remaining = principal;
  const monthlyPrincipal = Math.round((principal / termMonths) * 100) / 100;

  let totalInterest;
  if (interestType === 'flat') {
    totalInterest = calculateFlatInterest(principal, rate, termMonths);
  } else {
    totalInterest = calculateDiminishingInterest(principal, rate, termMonths);
  }

  const totalPayable = principal + totalInterest;
  const monthlyPayment = Math.round((totalPayable / termMonths) * 100) / 100;

  let remainingInterest = totalInterest;

  for (let month = 1; month <= termMonths; month++) {
    const isLastMonth = month === termMonths;
    let interestPortion;

    if (interestType === 'flat') {
      interestPortion = Math.round((totalInterest / termMonths) * 100) / 100;
    } else {
      interestPortion = Math.round((remaining * monthlyRate) * 100) / 100;
    }

    let principalPortion = Math.round((monthlyPayment - interestPortion) * 100) / 100;

    // Handle rounding for last month
    if (isLastMonth) {
      principalPortion = Math.round(remaining * 100) / 100;
    }

    const payment = Math.round((principalPortion + interestPortion) * 100) / 100;
    const beginningBalance = Math.round(remaining * 100) / 100;
    remaining = Math.round((remaining - principalPortion) * 100) / 100;

    schedule.push({
      month,
      beginningBalance,
      principalPortion,
      interestPortion,
      totalPayment: payment,
      endingBalance: Math.max(0, remaining),
    });
  }

  return schedule;
}

/**
 * Calculate loan summary
 */
function calculateLoanSummary(principal, rate, termMonths, interestType) {
  const totalInterest = interestType === 'flat'
    ? calculateFlatInterest(principal, rate, termMonths)
    : calculateDiminishingInterest(principal, rate, termMonths);

  const totalPayable = principal + totalInterest;
  const monthlyAmortization = calculateMonthlyAmortization(totalPayable, termMonths);

  return {
    principal,
    interestRate: rate,
    interestType,
    termMonths,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
    monthlyAmortization,
    schedule: generateAmortizationSchedule(principal, rate, termMonths, interestType),
  };
}

module.exports = {
  calculateFlatInterest,
  calculateDiminishingInterest,
  calculateMonthlyAmortization,
  generateAmortizationSchedule,
  calculateLoanSummary,
};
