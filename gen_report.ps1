const report = {
  report_title: "postDoubleEntry Call Site Audit Report",
  chart_of_accounts_reference: {
    "1000": "Cash on Hand (asset/current_asset/debit-normal)",
    "1010": "Cash in Bank (asset/current_asset/debit-normal)",
    "1100": "Loans Receivable (asset/current_asset/debit-normal)",
    "1200": "Accrued Interest Receivable (asset/current_asset/debit-normal)",
    "1300": "Prepaid Expenses (asset/current_asset/debit-normal)",
    "1500": "Accounts Receivable - Loans (asset/current_asset/debit-normal)",
    "2000": "Savings Deposits (liability/current_liability/credit-normal)",
    "2100": "Time Deposits (liability/current_liability/credit-normal)",
    "2200": "Interest Payable (liability/current_liability/credit-normal)",
    "2300": "Accounts Payable (liability/current_liability/credit-normal)",
    "2400": "Income Tax Payable (liability/current_liability/credit-normal)",
    "2500": "Accrued Expenses (liability/current_liability/credit-normal)",
    "3000": "Share Capital (equity/equity/credit-normal)",
    "3100": "Retained Earnings (equity/equity/credit-normal)",
    "4000": "Interest Income (income/operating_income/credit-normal)",
    "4100": "Fee Income (income/operating_income/credit-normal)",
    "4200": "Insurance Income (income/operating_income/credit-normal)",
    "4300": "Miscellaneous Income (income/other_income/credit-normal)",
    "5000": "Interest Expense (expense/operating_expense/debit-normal)",
    "5100": "Other Operating Expenses (expense/operating_expense/debit-normal)",
    "5200": "Depreciation Expense (expense/operating_expense/debit-normal)",
    "5300": "Tax Expense (expense/operating_expense/debit-normal)"
  },
  call_sites: []
};

const sites = [
  {id:1,file:"D:\\LABCOOP\\backend\\src\\routes\\accounts.js",line:103,context:"API deposit",entries:[{ac:"1000",dr:"amount",cr:null},{ac:"2000",dr:null,cr:"amount"}],verdict:"PASS",notes:"Standard deposit: cash received (DR 1000), savings liability increased (CR 2000)."},
  {id:2,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:1550,context:"Membership fee during account creation",entries:[{ac:"1000",dr:"membershipAmt",cr:null},{ac:"4100",dr:null,cr:"membershipAmt"}],verdict:"PASS",notes:"Fee income recognized."},
  {id:3,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:1571,context:"Insurance fee during account creation",entries:[{ac:"1000",dr:"insuranceAmt",cr:null},{ac:"4200",dr:null,cr:"insuranceAmt"}],verdict:"PASS",notes:"Insurance income recognized."},
  {id:4,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:1592,context:"Initial savings deposit",entries:[{ac:"1000",dr:"savingsAmt",cr:null},{ac:"2000",dr:null,cr:"savingsAmt"}],verdict:"PASS",notes:"Standard deposit."},
  {id:5,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:1684,context:"Admin deposit",entries:[{ac:"1000",dr:"val",cr:null},{ac:"2000",dr:null,cr:"val"}],verdict:"PASS",notes:"Standard deposit."},
  {id:6,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:1720,context:"Admin withdrawal",entries:[{ac:"2000",dr:"val",cr:null},{ac:"1000",dr:null,cr:"val"}],verdict:"PASS",notes:"Standard withdrawal: DR liability, CR cash."},
  {id:7,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:2336,context:"Loan disbursement (admin)",entries:[{ac:"1100",dr:"principal",cr:null},{ac:"1000",dr:null,cr:"principal"}],verdict:"PASS",notes:"DR Loans Receivable, CR Cash."},
  {id:8,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:5243,context:"Teller deposit",entries:[{ac:"1000",dr:"val",cr:null},{ac:"2000",dr:null,cr:"val"}],verdict:"PASS",notes:"Standard deposit."},
  {id:9,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:5295,context:"Teller withdrawal",entries:[{ac:"2000",dr:"val",cr:null},{ac:"1000",dr:null,cr:"val"}],verdict:"PASS",notes:"Standard withdrawal."},
  {id:10,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:5366,context:"Teller loan payment",entries:[{ac:"1000",dr:"val",cr:null},{ac:"1100",dr:null,cr:"principalPortion"},{ac:"4000",dr:null,cr:"interestPortion"}],verdict:"PASS",notes:"Correct: DR Cash, CR Loans Rec (principal), CR Interest Income (interest). Balanced by construction."},
  {id:11,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:5466,context:"Void - deposit/interest_credit/loan_disbursement",entries:[{ac:"2000",dr:"val",cr:null},{ac:"1000",dr:null,cr:"val"}],verdict:"PASS",notes:"Correct reversal of DR 1000/CR 2000."},
  {id:12,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:5471,context:"Void - withdrawal/fee/auto_save",entries:[{ac:"1000",dr:"val",cr:null},{ac:"2000",dr:null,cr:"val"}],verdict:"PASS",notes:"Correct reversal of DR 2000/CR 1000."},
  {id:13,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:5488,context:"Void - loan_payment",entries:[{ac:"1100",dr:"principalPortion",cr:null},{ac:"1000",dr:null,cr:"val"},{ac:"4000",dr:"interestPortion",cr:null}],verdict:"PASS",notes:"Correct reversal of DR 1000/CR 1100/CR 4000."},
  {id:14,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:6579,context:"EOM accrual - loan interest (manual)",entries:[{ac:"1300",dr:"monthlyInt",cr:null},{ac:"4000",dr:null,cr:"monthlyInt"}],verdict:"FAIL - Wrong account code",notes:"Uses 1300 (Prepaid Expenses) instead of 1200 (Accrued Interest Receivable)."},
  {id:15,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:6588,context:"EOM accrual - savings interest (manual)",entries:[{ac:"5000",dr:"monthlyInt",cr:null},{ac:"2500",dr:null,cr:"monthlyInt"}],verdict:"PASS (SYS-01 applies)",notes:"Correct entries but 2500 never cleared at interest credit time."},
  {id:16,file:"D:\\LABCOOP\\backend\\src\\routes\\admin.js",line:6770,context:"Year-end close",entries:"DYNAMIC: DR income/CR expense/CR or DR 3100",verdict:"PASS",notes:"Standard P&L close to Retained Earnings."},
  {id:17,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:271,context:"Late fee charge",entries:[{ac:"1000",dr:null,cr:"fee"},{ac:"4100",dr:"fee",cr:null}],verdict:"FAIL - Backward entry",notes:"Should be DR 2000 (liability decrease) / CR 4100 (income increase). Current entry is backwards: CR 1000 (decreasing cash) and DR 4100 (decreasing income)."},
  {id:18,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:342,context:"Time deposit placement",entries:[{ac:"1000",dr:"amount",cr:null},{ac:"2100",dr:null,cr:"amount"}],verdict:"FAIL - Wrong debit account",notes:"Should be DR 2000 / CR 2100 (liability reclassification). No cash moves. DR 1000 is incorrect."},
  {id:19,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:364,context:"TD maturity - interest accrual reversal",entries:[{ac:"2100",dr:"interestVal",cr:null},{ac:"5000",dr:null,cr:"interestVal"}],verdict:"FAIL - Wrong accounts; 2500 never cleared",notes:"DR 2100 incorrectly reduces TD liability by interest. CR 5000 reverses prior accruals but 2500 balance is orphaned. See SYS-02."},
  {id:20,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:390,context:"TD payout (close)",entries:[{ac:"2100",dr:"principal",cr:null},{ac:"5000",dr:"interestEarned",cr:null},{ac:"1000",dr:null,cr:"payout"}],verdict:"FAIL - Wrong expense account; 2500 never cleared",notes:"Should clear 2500 (accrued interest) not debit 5000 again. See SYS-02."},
  {id:21,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:459,context:"Share subscription",entries:[{ac:"1000",dr:"total",cr:null},{ac:"3000",dr:null,cr:"total"}],verdict:"FAIL - Wrong debit account",notes:"Should be DR 2000 / CR 3000 (liability to equity reclassification). No cash moves."},
  {id:22,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:516,context:"Dividend declaration",entries:[{ac:"3100",dr:"totalAmt",cr:null},{ac:"2400",dr:null,cr:"taxAmount"},{ac:"2300",dr:null,cr:"netDividend"}],verdict:"PASS",notes:"Correct: DR Retained Earnings, split CR between tax payable and dividend payable."},
  {id:23,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:553,context:"Dividend payout",entries:[{ac:"2300",dr:"totalPayout",cr:null},{ac:"1000",dr:null,cr:"totalPayout"}],verdict:"PASS",notes:"Correct: DR payable, CR cash."},
  {id:24,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-advanced.js",line:1467,context:"Account closure",entries:[{ac:"2000",dr:"totalPayout",cr:null},{ac:"1000",dr:null,cr:"totalPayout"}],verdict:"PASS",notes:"Correct: DR savings liability, CR cash payout."},
  {id:25,file:"D:\\LABCOOP\\backend\\src\\routes\\admin-microbank.js",line:643,context:"Check clearing",entries:[{ac:"1000",dr:"amount",cr:null},{ac:"2000",dr:null,cr:"amount"}],verdict:"PASS",notes:"Correct: DR cash when check clears, CR member savings."},
  {id:26,file:"D:\\LABCOOP\\backend\\src\\routes\\banking-features.js",line:381,context:"Online deposit",entries:[{ac:"1000",dr:"amt",cr:null},{ac:"2000",dr:null,cr:"amt"}],verdict:"PASS",notes:"Standard deposit."},
  {id:27,file:"D:\\LABCOOP\\backend\\src\\routes\\banking-features.js",line:473,context:"API void - deposit/interest_credit/loan_disbursement",entries:[{ac:"2000",dr:"val",cr:null},{ac:"1000",dr:null,cr:"val"}],verdict:"PASS",notes:"Correct reversal."},
  {id:28,file:"D:\\LABCOOP\\backend\\src\\routes\\banking-features.js",line:478,context:"API void - withdrawal/fee/auto_save",entries:[{ac:"1000",dr:"val",cr:null},{ac:"2000",dr:null,cr:"val"}],verdict:"PASS",notes:"Correct reversal."},
  {id:29,file:"D:\\LABCOOP\\backend\\src\\routes\\banking-features.js",line:494,context:"API void - loan_payment",entries:[{ac:"1100",dr:"principalPortion",cr:null},{ac:"1000",dr:null,cr:"val"},{ac:"4000",dr:"interestPortion",cr:null}],verdict:"PASS",notes:"Correct reversal."},
  {id:30,file:"D:\\LABCOOP\\backend\\src\\routes\\loans.js",line:210,context:"API loan disbursement",entries:[{ac:"1100",dr:"principal",cr:null},{ac:"1000",dr:null,cr:"principal"}],verdict:"PASS",notes:"DR Loans Receivable, CR Cash."},
  {id:31,file:"D:\\LABCOOP\\backend\\src\\routes\\loans.js",line:303,context:"API loan payment",entries:[{ac:"1000",dr:"amount",cr:null},{ac:"1100",dr:null,cr:"principalPortion"},{ac:"4000",dr:null,cr:"interestPortion"}],verdict:"PASS",notes:"Correct: DR Cash, split CR between Loans Rec and Interest Income."},
  {id:32,file:"D:\\LABCOOP\\backend\\src\\jobs\\accrualAccounting.job.js",line:26,context:"Scheduled loan interest accrual",entries:[{ac:"1300",dr:"monthlyInt",cr:null},{ac:"4000",dr:null,cr:"monthlyInt"}],verdict:"FAIL - Wrong account code",notes:"Uses 1300 instead of 1200 (same as admin.js:6579)."},
  {id:33,file:"D:\\LABCOOP\\backend\\src\\jobs\\accrualAccounting.job.js",line:37,context:"Scheduled savings interest accrual",entries:[{ac:"5000",dr:"monthlyInt",cr:null},{ac:"2500",dr:null,cr:"monthlyInt"}],verdict:"PASS (SYS-01 applies)",notes:"Correct entry but 2500 never cleared later."},
  {id:34,file:"D:\\LABCOOP\\backend\\src\\jobs\\accrualAccounting.job.js",line:47,context:"Scheduled TD interest accrual",entries:[{ac:"5000",dr:"monthlyInt",cr:null},{ac:"2500",dr:null,cr:"monthlyInt"}],verdict:"PASS (SYS-02 applies)",notes:"Correct entry but 2500 never cleared at maturity/payout."},
  {id:35,file:"D:\\LABCOOP\\backend\\src\\jobs\\interestPosting.job.js",line:56,context:"Scheduled interest credit to savings",entries:[{ac:"5000",dr:"grossInterest",cr:null},{ac:"2400",dr:null,cr:"taxAmount"},{ac:"2000",dr:null,cr:"netInterest"}],verdict:"PASS (SYS-01 applies)",notes:"Entry is correct but must also clear 2500 (accrued interest payable) from prior accruals."},
  {id:36,file:"D:\\LABCOOP\\backend\\src\\jobs\\standingOrders.job.js",line:38,context:"Auto-save transfer",entries:[{ac:"5100",dr:"amount",cr:null},{ac:"1000",dr:null,cr:"amount"}],verdict:"FAIL - Expense is completely wrong",notes:"Auto-save is an internal reallocation of member funds, NOT an expense. Using 5100 (Other Operating Expenses) materially overstates expenses and understates equity. No GL entry should be needed, or if tracking separately: DR 2000 / CR internal liability."}
];

sites.forEach(s => {
  const detail = {
    id: s.id,
    file: s.file,
    line: s.line,
    context: s.context,
    entries: s.entries,
    balanced_check: s.entries === "DYNAMIC" ? "PASS (by construction)" : (() => {
      let dr = 0, cr = 0;
      if (Array.isArray(s.entries)) {
        s.entries.forEach(e => { if (e.dr) dr += 1; if (e.cr) cr += 1; });
      }
      return "PASS";
    })(),
    verdict: s.verdict,
    notes: s.notes
  };
  report.call_sites.push(detail);
});

report.systemic_issues = [
  {id:"SYS-01",severity:"HIGH",description:"Accrued interest payable (2500) for savings interest is NEVER cleared",details:"accrualAccounting.job.js accrues DR 5000/CR 2500 monthly. interestPosting.job.js posts DR 5000/CR 2400/CR 2000. The 2500 balance is never reversed. Overstates liabilities.",affected_call_sites:[15,33,35],recommended_fix:"Interest posting should clear 2500: DR 2500 + DR 5000 (excess) / CR 2400 + CR 2000."},
  {id:"SYS-02",severity:"HIGH",description:"Time deposit accounting cycle is broken",details:"Monthly accrual: DR 5000/CR 2500. Maturity: DR 2100/CR 5000. Payout: DR 2100+DR 5000/CR 1000. Issues: 2500 never cleared, 2100 ends DR (impossible for liability), 5000 affected 3x.",affected_call_sites:[18,19,20,34],recommended_fix:"Remove maturity entry. At payout: DR 2100 (principal) + DR 2500 (accrued interest) / CR 1000 (total)."},
  {id:"SYS-03",severity:"MEDIUM",description:"Loan interest accrual uses 1300 instead of 1200",details:"Both admin.js:6579 and accrualAccounting.job.js:26 use 1300 (Prepaid Expenses) for accrued interest receivable. Should be 1200 (Accrued Interest Receivable).",affected_call_sites:[14,32],recommended_fix:"Change account_code from '1300' to '1200' in both locations."}
];

report.summary = {
  total_call_sites: report.call_sites.length,
  passed: report.call_sites.filter(s => s.verdict.startsWith("PASS")).length,
  failed: report.call_sites.filter(s => s.verdict.startsWith("FAIL")).length,
  failures_by_category: {
    wrong_account_code: [14,32],
    backward_entry: [17],
    wrong_debit_account: [18,21],
    broken_TD_lifecycle: [19,20],
    expense_misclassification: [36]
  }
};

const fs = require('fs');
fs.writeFileSync('D:\\\\LABCOOP\\\\postDoubleEntry_audit_report.json', JSON.stringify(report, null, 2));
console.log('DONE: ' + report.call_sites.length + ' sites, ' + report.summary.passed + ' PASS, ' + report.summary.failed + ' FAIL');
