require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const { store, isPostgres } = require('./db');

async function ensureDb() {
  if (isPostgres) return; // skip seed on PG — user will create accounts via admin
  try {
    const existing = await store.getAccount('00000000-0000-0000-0000-000000000001');
    if (existing) {
      console.log('Seed data already exists.');
      return;
    }

    const defaultHash = bcrypt.hashSync('0000', 10);
    await store.createAccount({
      child_name: 'Juan', member_id: '000001', password: defaultHash,
      password_changed: 0, actual_balance: 1500, unallocated_balance: 200, current_xp: 45,
      parent_phone: '09171234567',
    });
    await store.createAccount({
      child_name: 'Maria', member_id: '000002', password: defaultHash,
      password_changed: 0, actual_balance: 2500, unallocated_balance: 500, current_xp: 120,
      parent_phone: '09179876543',
    });

    await store.createGoal({ account_id: '00000000-0000-0000-0000-000000000001', title: 'New School Shoes', target_amount: 1000, current_allocated: 650, category_icon: 'shoes' });
    await store.createGoal({ account_id: '00000000-0000-0000-0000-000000000001', title: 'Bicycle', target_amount: 3000, current_allocated: 450, category_icon: 'bike' });
    await store.createGoal({ account_id: '00000000-0000-0000-0000-000000000001', title: 'Video Game', target_amount: 500, current_allocated: 200, category_icon: 'game' });
    await store.createGoal({ account_id: '00000000-0000-0000-0000-000000000002', title: 'Art Set', target_amount: 800, current_allocated: 600, category_icon: 'toy' });
    await store.createGoal({ account_id: '00000000-0000-0000-0000-000000000002', title: 'Birthday Gift for Mama', target_amount: 2000, current_allocated: 1400, category_icon: 'savings' });

    const shopItems = [
      ['av_cat', 'Kitty', 'avatar', 0, '\u{1F431}', 'Common', '#2E7D32', '#2E7D32', ''],
      ['av_dog', 'Puppy', 'avatar', 5, '\u{1F436}', 'Common', '#2E7D32', '#2E7D32', ''],
      ['av_lion', 'Lion', 'avatar', 10, '\u{1F981}', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_tiger', 'Tiger', 'avatar', 10, '\u{1F42F}', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_bear', 'Bear', 'avatar', 15, '\u{1F43B}', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_panda', 'Panda', 'avatar', 15, '\u{1F43C}', 'Uncommon', '#FFA000', '#FFA000', ''],
      ['av_fox', 'Fox', 'avatar', 20, '\u{1F98A}', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_unicorn', 'Unicorn', 'avatar', 30, '\u{1F984}', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_monkey', 'Monkey', 'avatar', 20, '\u{1F435}', 'Rare', '#9C27B0', '#9C27B0', ''],
      ['av_frog', 'Frog', 'avatar', 25, '\u{1F438}', 'Epic', '#D32F2F', '#D32F2F', ''],
      ['av_owl', 'Owl', 'avatar', 25, '\u{1F989}', 'Epic', '#D32F2F', '#D32F2F', ''],
      ['av_dino', 'Dino', 'avatar', 40, '\u{1F996}', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_robot', 'Robot', 'avatar', 50, '\u{1F916}', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_ghost', 'Ghost', 'avatar', 45, '\u{1F47B}', 'Legendary', '#00BCD4', '#00BCD4', ''],
      ['av_alien', 'Alien', 'avatar', 55, '\u{1F47D}', 'Mythic', '#E91E63', '#E91E63', ''],
      ['av_dragon', 'Dragon', 'avatar', 80, '\u{1F409}', 'Mythic', '#E91E63', '#E91E63', ''],
    ];
    for (const a of shopItems) {
      await store.query(
        'INSERT INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) ON CONFLICT (id) DO NOTHING',
        a
      );
    }
    const borderItems = [
      ['b_default', 'Basic', 'border', 0, '', 'Common', '#2E7D32', '#2E7D32', ''],
      ['b_silver', 'Silver', 'border', 10, '', 'Uncommon', '#C0C0C0', '#9E9E9E', ''],
      ['b_gold', 'Gold', 'border', 25, '', 'Rare', '#FFD700', '#FFA000', ''],
      ['b_purple', 'Epic', 'border', 40, '', 'Epic', '#9C27B0', '#6A1B9A', ''],
      ['b_legendary', 'Legendary', 'border', 60, '', 'Legendary', '#D32F2F', '#FF6F00', ''],
      ['b_rainbow', 'Rainbow', 'border', 85, '', 'Special', '#E91E63', '#2196F3', ''],
      ['b_mythic', 'Mythic', 'border', 120, '', 'Mythic', '#00BCD4', '#304FFE', ''],
    ];
    for (const b of borderItems) {
      await store.query(
        'INSERT INTO shop_items (id, name, type, cost, emoji, rarity, color1, color2, image_url, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) ON CONFLICT (id) DO NOTHING',
        b
      );
    }

    const quizSeed = [
      // ── EASY (20) ──
      ['q_e01','What is saving money?','["Spending all you have","Keeping money for later","Giving it away","Losing it"]',1,'Saving means setting aside money for future use instead of spending it all now.','Savings','easy',10,5],
      ['q_e02','What is a coin?','["Paper money","A metal piece used as money","A toy","A game"]',1,'Coins are metal pieces that we use as money to buy things.','Banking','easy',10,5],
      ['q_e03','Which is a NEED?','["Video game","Candy","Food","Toy"]',2,'Food is a need — something you must have to live.','Savings','easy',10,5],
      ['q_e04','If you have ₱50 and save ₱10, how much is left to spend?','["₱30","₱40","₱50","₱60"]',1,'₱50 - ₱10 = ₱40. Saving part of your money leaves the rest for spending.','Math','easy',10,5],
      ['q_e05','What is a piggy bank for?','["To break","To store coins","To play music","To draw"]',1,'A piggy bank is a container where you keep your coins to save them up.','Savings','easy',10,5],
      ['q_e06','What does "budget" mean?','["A type of toy","A spending plan","A game level","A food item"]',1,'A budget is a plan that helps you decide how to spend and save your money wisely.','Budgeting','easy',10,5],
      ['q_e07','Which is a WANT?','["Water","Shelter","Clothes","New toy"]',3,'A new toy is a want — nice to have but not necessary for survival.','Savings','easy',10,5],
      ['q_e08','How many ₱5 coins equal ₱20?','["2","3","4","5"]',2,'₱20 ÷ ₱5 = 4. You need four 5-peso coins to make 20 pesos.','Math','easy',10,5],
      ['q_e09','Where can you keep money safely?','["Under your pillow","In a bank","In a drawer","In your pocket"]',1,'Banks are the safest place to keep money. They also help it grow!','Banking','easy',10,5],
      ['q_e10','What is a "goal jar"?','["A jar for cookies","A savings target for something you want","A toy container","A type of candy"]',1,'A goal jar helps you save money for one specific thing you want to buy.','Savings','easy',10,5],
      ['q_e11','What is income?','["Money you spend","Money you receive","Money you lose","Money you hide"]',1,'Income is the money you receive, like allowance or earnings from chores.','Budgeting','easy',10,5],
      ['q_e12','If you save ₱10 each day for 5 days, how much total?','["₱30","₱40","₱50","₱60"]',2,'₱10 × 5 = ₱50. Small daily savings add up over time.','Math','easy',10,5],
      ['q_e13','What is a "passbook"?','["A book to draw in","A record of your savings","A storybook","A phone app"]',1,'A passbook is a small book that records how much money you have saved in the bank.','Savings','easy',10,5],
      ['q_e14','What should you do before buying something?','["Buy immediately","Check the price and think","Ignore it","Ask a stranger"]',1,'Always check the price first and think about whether you really want it.','Savings','easy',10,5],
      ['q_e15','What is a "bank"?','["A toy store","A safe place for money","A school","A park"]',1,'A bank is a business where people keep their money safe and can earn interest.','Banking','easy',10,5],
      ['q_e16','What does "spend" mean?','["To save money","To use money to buy things","To hide money","To count money"]',1,'Spending means using your money to pay for something you want or need.','Budgeting','easy',10,5],
      ['q_e17','Which choice helps you save more?','["Buying everything you see","Setting aside savings first","Spending all allowance","Borrowing from friends"]',1,'Pay yourself first — set aside savings before spending on anything else.','Savings','easy',10,5],
      ['q_e18','What is a "price tag"?','["A game label","The cost of an item","A clothing brand","A receipt"]',1,'A price tag tells you how much money you need to pay for an item.','Savings','easy',10,5],
      ['q_e19','How much is ₱100 minus ₱25?','["₱65","₱70","₱75","₱80"]',2,'₱100 - ₱25 = ₱75. Subtracting helps you track what remains.','Math','easy',10,5],
      ['q_e20','Why do people work?','["To sleep","To earn money","To play","To study"]',1,'People work to earn money to pay for their needs and wants and to save for goals.','Budgeting','easy',10,5],

      // ── MEDIUM (20) ──
      ['q_m01','What is the 50/30/20 rule?','["50% needs, 30% wants, 20% savings","50% toys, 30% food, 20% games","Equal thirds","None of these"]',0,'The 50/30/20 rule helps balance needs, wants, and savings.','Budgeting','medium',15,8],
      ['q_m02','What does "interest" mean in banking?','["Something boring","Money the bank pays you for saving","A fee you pay","A type of game"]',1,'Banks pay you interest as a reward for keeping your money with them.','Banking','medium',15,8],
      ['q_m03','If a toy costs ₱300 and you save ₱30 per week, how many weeks?','["5","8","10","15"]',2,'₱300 ÷ ₱30 = 10 weeks. Patience and regular saving help you reach your goal.','Math','medium',15,8],
      ['q_m04','What is "emergency savings"?','["Money for toys","Money saved for unexpected situations","Money for games","Money for snacks"]',1,'Emergency savings help you handle unplanned expenses like repairs or medical needs.','Savings','medium',15,8],
      ['q_m05','What does "compounding" mean?','["Making things flat","Earning interest on your interest","A type of candy","A math problem"]',1,'Compounding means your interest earns more interest — your money grows faster over time.','Banking','medium',15,8],
      ['q_m06','How can you avoid impulse buying?','["Buy immediately","Wait 24 hours before deciding","Ask a friend to buy it","Ignore all wants"]',1,'Waiting 24 hours helps you decide if you really want it or just felt a sudden urge.','Savings','medium',15,8],
      ['q_m07','What is a "credit card"?','["Free money forever","Borrowed money you must pay back","A savings account","A toy"]',1,'Credit cards let you borrow money to buy now, but you must pay it back later with possible interest.','Banking','medium',15,8],
      ['q_m08','What is "inflation"?','["Prices going up over time","Money growing in the bank","A type of saving","A budget rule"]',0,'Inflation means the cost of goods and services increases over time, reducing purchasing power.','Banking','medium',15,8],
      ['q_m09','If you have ₱500 in the bank with 5% interest, how much after one year?','["₱505","₱510","₱520","₱525"]',3,'₱500 × 0.05 = ₱25 interest. Total = ₱525. Your money grows!','Math','medium',15,8],
      ['q_m10','What is a "need" vs a "want"?','["A need is optional","A need is essential to live","They are the same","A want is essential"]',1,'Needs are things you must have to survive (food, shelter). Wants are extras (toys, games).','Savings','medium',15,8],
      ['q_m11','What does "pay yourself first" mean?','["Spend all your money","Save before spending","Pay others first","Ignore savings"]',1,'Pay yourself first means setting aside savings as soon as you receive income, before spending.','Savings','medium',15,8],
      ['q_m12','Why is it important to track spending?','["To know where your money goes","To spend more","To hide money","To impress friends"]',0,'Tracking spending helps you see where your money is going and find ways to save more.','Budgeting','medium',15,8],
      ['q_m13','What is a "savings account"?','["A place to keep money and earn interest","A checking account for daily use","A loan from the bank","A credit card"]',0,'A savings account is a bank account that keeps your money safe and pays you interest.','Banking','medium',15,8],
      ['q_m14','If you buy ₱80 of school supplies with ₱200, how much left?','["₱100","₱110","₱120","₱130"]',2,'₱200 - ₱80 = ₱120. Always check your change and remaining balance.','Math','medium',15,8],
      ['q_m15','What is a "receipt"?','["A cooking recipe","Proof of purchase","A bank statement","A coupon"]',1,'A receipt is a document that proves you paid for something — keep it for returns and tracking.','Budgeting','medium',15,8],
      ['q_m16','What does "donate" mean?','["To throw away","To give money to help others","To spend on yourself","To save"]',1,'Donating means giving money or items to help people or causes in need.','Savings','medium',15,8],
      ['q_m17','What is a good reason to save for a goal?','["To spend quickly","It teaches patience and discipline","It is boring","To show off"]',1,'Saving toward a goal teaches patience, discipline, and the satisfaction of achievement.','Savings','medium',15,8],
      ['q_m18','What does ATM stand for?','["Automated Teller Machine","Always Transfer Money","Automatic Transaction Machine","All Time Money"]',0,'An ATM is a machine that lets you withdraw or deposit money without visiting a bank teller.','Banking','medium',15,8],
      ['q_m19','What is a "budget deficit"?','["Spending less than income","Spending more than income","Saving extra money","Balanced budget"]',1,'A budget deficit happens when you spend more money than you have coming in.','Budgeting','medium',15,8],
      ['q_m20','If you save ₱50 per month for 6 months, how much?','["₱200","₱250","₱300","₱350"]',2,'₱50 × 6 = ₱300. Consistent saving over time builds significant funds.','Math','medium',15,8],

      // ── HARD (20) ──
      ['q_h01','What is compound interest?','["Simple interest on principal","Interest earned on principal AND accumulated interest","A fee charged by banks","A type of tax"]',1,'Compound interest earns returns on both your original money and previously earned interest.','Banking','hard',20,10],
      ['q_h02','What is an "asset"?','["Something you owe","Something you own that has value","A monthly bill","A type of loan"]',1,'An asset is anything you own that has financial value, like savings, a house, or investments.','Investing','hard',20,10],
      ['q_h03','What is a "liability"?','["Something you own","A debt or obligation","An investment","A savings goal"]',1,'A liability is a debt or financial obligation you owe to someone else.','Investing','hard',20,10],
      ['q_h04','What is "diversification"?','["Putting all money in one place","Spreading investments across different assets","A type of bank account","Spending money on variety"]',1,'Diversification means spreading your investments to reduce risk — don\'t put all eggs in one basket.','Investing','hard',20,10],
      ['q_h05','What is a "stock"?','["A loan to a company","Ownership share in a company","A type of bond","A savings account"]',1,'A stock represents a small piece of ownership in a company. Its value can go up or down.','Investing','hard',20,10],
      ['q_h06','What is "opportunity cost"?','["The cost of an item","What you give up when choosing one option","A discount price","A hidden fee"]',1,'Opportunity cost is the value of what you give up when you choose one option over another.','Budgeting','hard',20,10],
      ['q_h07','What is a "bond"?','["A company ownership","A loan to a government or company","A savings account","A type of stock"]',1,'A bond is like a loan you give to a government or company. They pay you interest and return your money later.','Investing','hard',20,10],
      ['q_h08','What is the Rule of 72?','["72% interest rule","72 ÷ interest rate = years to double money","A tax calculation","A budget rule"]',1,'The Rule of 72 estimates how many years it takes to double your money: 72 ÷ annual interest rate.','Investing','hard',20,10],
      ['q_h09','What is "net worth"?','["Total income","Assets minus liabilities","Total savings","Monthly salary"]',1,'Net worth is what you own (assets) minus what you owe (liabilities). A measure of financial health.','Budgeting','hard',20,10],
      ['q_h10','If inflation is 3% and your savings earn 1%, what happens?','["You gain money","You lose purchasing power","Nothing changes","Your money doubles"]',1,'When inflation outpaces interest, your money\'s purchasing power decreases over time.','Banking','hard',20,10],
      ['q_h11','What is a "mutual fund"?','["A single stock","A pool of money invested in many assets","A type of bank","A government bond"]',1,'A mutual fund collects money from many investors to buy a diversified portfolio of stocks and bonds.','Investing','hard',20,10],
      ['q_h12','What does "APR" stand for?','["Annual Percentage Rate","Annual Payment Rate","Applied Percentage Rate","Average Payment Return"]',0,'APR is the annual cost of borrowing money, including interest and fees, expressed as a percentage.','Banking','hard',20,10],
      ['q_h13','What is an "emergency fund" typically recommended for?','["A vacation","3-6 months of expenses","A new car","Daily coffee"]',1,'Financial experts recommend saving 3 to 6 months of living expenses for emergencies.','Savings','hard',20,10],
      ['q_h14','What is "compound frequency"?','["How often interest is calculated and added","How much interest you earn","The interest rate","The account balance"]',0,'More frequent compounding (daily vs yearly) means your money grows faster.','Banking','hard',20,10],
      ['q_h15','What is a "bear market"?','["Rising stock prices","Falling stock prices by 20%+","Stable market","New market"]',1,'A bear market means stock prices have fallen 20% or more from recent highs, often due to pessimism.','Investing','hard',20,10],
      ['q_h16','What does "liquidity" mean?','["How quickly an asset can become cash","How much an asset is worth","How risky an asset is","How old an asset is"]',0,'Liquidity is how fast you can convert an asset to cash without losing value. Cash is most liquid.','Investing','hard',20,10],
      ['q_h17','What is "dollar-cost averaging"?','["Buying at the lowest price","Investing fixed amounts regularly regardless of price","Selling at the highest price","Avoiding the market"]',1,'Dollar-cost averaging means investing the same amount at regular intervals, reducing timing risk.','Investing','hard',20,10],
      ['q_h18','What is a "credit score"?','["Your exam score","A number representing creditworthiness","Your bank balance","Your income level"]',1,'A credit score is a number that shows how likely you are to pay back borrowed money.','Banking','hard',20,10],
      ['q_h19','What is "amortization"?','["Paying off debt gradually over time","A type of investment","A budget method","A tax deduction"]',0,'Amortization is the process of spreading out a loan into regular payments over time.','Banking','hard',20,10],
      ['q_h20','If a ₱10,000 investment grows 8% annually, approximate value after 9 years?','["₱12,000","₱15,000","₱20,000","₱25,000"]',2,'Rule of 72: 72 ÷ 8 = 9 years to double. So about ₱20,000.','Math','hard',20,10],

      // ── EXPERT (20) ──
      ['q_x01','What is a "401(k)"?','["A type of insurance","A retirement savings plan with tax benefits","A government bond","A stock market index"]',1,'A 401(k) is an employer-sponsored retirement account that offers tax advantages for long-term saving.','Investing','expert',30,15],
      ['q_x02','What is "capital gains tax"?','["Tax on income","Tax on profit from selling assets","Tax on purchases","Tax on property"]',1,'Capital gains tax is levied on the profit you make when you sell an asset for more than you paid.','Investing','expert',30,15],
      ['q_x03','What is a "Roth IRA"?','["A pre-tax retirement account","A post-tax retirement account with tax-free withdrawals","A type of bond","A savings account"]',1,'Roth IRA contributions are made with after-tax money, but qualified withdrawals are tax-free.','Investing','expert',30,15],
      ['q_x04','What is "hedging" in investing?','["Avoiding all investments","Reducing risk through offsetting positions","Maximizing returns","Day trading"]',1,'Hedging means taking positions that offset potential losses in other investments, like insurance.','Investing','expert',30,15],
      ['q_x05','What does "EBITDA" stand for?','["Earnings Before Interest, Taxes, Depreciation, Amortization","Estimated Business Income","Earnings Based on Income","Expenses Before Tax"]',0,'EBITDA measures a company\'s operating performance by excluding certain non-cash and financing expenses.','Investing','expert',30,15],
      ['q_x06','What is "quantitative easing"?','["A budgeting method","Central bank buying assets to increase money supply","A tax policy","A stock trading strategy"]',1,'Quantitative easing is when a central bank buys financial assets to increase money supply and stimulate the economy.','Banking','expert',30,15],
      ['q_x07','What is a "derivative"?','["A primary asset","A financial contract derived from an underlying asset","A type of stock","A savings account"]',1,'Derivatives (options, futures) get their value from an underlying asset like stocks or commodities.','Investing','expert',30,15],
      ['q_x08','What is "arbitrage"?','["A type of loan","Profiting from price differences in different markets","A budget method","A tax strategy"]',1,'Arbitrage means buying an asset in one market and selling it in another at a higher price for profit.','Investing','expert',30,15],
      ['q_x09','What is a "bull call spread"?','["A type of savings account","An options strategy for moderate bullish outlook","A market index","A bond type"]',1,'A bull call spread involves buying a call option and selling a higher-priced call option to limit risk.','Investing','expert',30,15],
      ['q_x10','What is "tax-loss harvesting"?','["Evading taxes","Selling losing investments to offset gains","A retirement strategy","A type of bond"]',1,'Tax-loss harvesting means selling investments at a loss to reduce your taxable capital gains.','Investing','expert',30,15],
      ['q_x11','What is a "PEG ratio"?','["Price-to-Earnings divided by Growth rate","Price-to-Earnings x Growth","A bond rating","A risk measure"]',0,'The PEG ratio adjusts the P/E ratio for expected growth, helping value stocks more fairly.','Investing','expert',30,15],
      ['q_x12','What is "duration" in bond investing?','["The time until maturity","Sensitivity of bond price to interest rate changes","The bond\'s age","The coupon rate"]',1,'Bond duration measures how much a bond\'s price will change when interest rates move.','Investing','expert',30,15],
      ['q_x13','What is a "credit default swap"?','["A loan agreement","Insurance against a borrower defaulting","A type of bond","A savings product"]',1,'A CDS is a financial derivative that acts like insurance against a company or country defaulting on debt.','Investing','expert',30,15],
      ['q_x14','What is "the efficient frontier"?','["A tax boundary","Set of optimal portfolios with highest return for given risk","Market index","Budget limit"]',1,'The efficient frontier represents portfolios that offer the highest expected return for a given risk level.','Investing','expert',30,15],
      ['q_x15','What is "Monte Carlo simulation" used for in finance?','["Gambling strategy","Modeling probability of different investment outcomes","A budgeting method","Tax calculation"]',1,'Monte Carlo simulation runs thousands of scenarios to estimate the probability of achieving financial goals.','Investing','expert',30,15],
      ['q_x16','What is "behavioral finance"?','["Stock market psychology","How emotions and biases affect financial decisions","A trading algorithm","A budget method"]',1,'Behavioral finance studies how psychological factors like fear and greed impact financial decisions.','Investing','expert',30,15],
      ['q_x17','What is a "sovereign wealth fund"?','["A personal retirement fund","A state-owned investment fund","A type of bank","A government budget"]',1,'A sovereign wealth fund is a state-owned investment fund that manages a country\'s reserves.','Investing','expert',30,15],
      ['q_x18','What is "carry trade" in forex?','["Borrowing low-interest currency to invest in high-interest one","A type of options","Trading commodities","Currency hedging"]',0,'Carry trade involves borrowing a currency with low interest rates and using it to buy higher-yielding currencies.','Investing','expert',30,15],
      ['q_x19','What is "fractional reserve banking"?','["Banks keeping all deposits","Banks lending most deposited money while keeping a fraction as reserves","A type of investment","Government regulation"]',1,'Banks are required to keep only a fraction of deposits as reserves, lending the rest to create money.','Banking','expert',30,15],
      ['q_x20','What is the "Sharpe ratio"?','["Risk-free return","Risk-adjusted return measure","Market return","Portfolio size"]',1,'The Sharpe ratio measures how much excess return you get per unit of risk — higher is better.','Investing','expert',30,15],
    ];
    for (const q of quizSeed) {
      await store.query(
        'INSERT INTO quiz_questions (id, question, options, correct_index, explanation, category, difficulty_level, xp_reward, coin_reward, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) ON CONFLICT (id) DO NOTHING',
        q.map(v => typeof v === 'string' ? v : JSON.stringify(v))
      );
    }
      await store.query(
      `INSERT INTO savings_products (product_id, name, description, interest_rate, interest_frequency, min_balance, is_active, created_at)
       VALUES ('sp_regular', 'Regular Savings', 'Default savings account with automatic interest', 0.02, 'yearly', 0, 1, $1)
       ON CONFLICT (product_id) DO UPDATE SET interest_rate = 0.02, interest_frequency = 'yearly'`,
      [new Date().toISOString()]
    );
    // Seed default maintaining balance setting if not set
    try {
      const existing = await store.query("SELECT * FROM settings WHERE key = 'default_maintaining_balance'");
      if (!existing.rows.length) {
        await store.query("INSERT INTO settings (key, value) VALUES ('default_maintaining_balance', '100')");
        console.log('Default maintaining balance set to PHP 100');
      }
    } catch (_) {}
    console.log('Seed data ensured.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

async function ensureAdmin() {
  try {
    const result = await store.query('SELECT COUNT(*) as c FROM admin_users');
    if (parseInt(result.rows[0]?.c || '0', 10) === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await store.query(
        'INSERT INTO admin_users (admin_id, username, password_hash, role, display_name, is_active, created_at) VALUES ($1,$2,$3,$4,$5,1,$6)',
        ['00000000-0000-0000-0000-000000000000', 'admin', hash, 'super_admin', 'Default Admin', new Date().toISOString()]
      );
      console.log('Default admin created: admin / admin123');
    }
  } catch (err) {
    console.error('Admin seed failed (non-fatal):', err.message);
  }
}

async function ensureSavingsProduct() {
  try {
    const existing = await store.query("SELECT * FROM savings_products WHERE product_id = 'sp_regular'");
    if (!existing.rows.length) {
      await store.query(
        `INSERT INTO savings_products (product_id, name, description, interest_rate, interest_frequency, min_balance, is_active, created_at)
         VALUES ('sp_regular', 'Regular Savings', 'Default savings account with automatic interest', 0.02, 'yearly', 0, 1, $1)`,
        [new Date().toISOString()]
      );
      console.log('Default savings product created: sp_regular (2% yearly)');
    }
  } catch (err) {
    console.error('Savings product seed failed (non-fatal):', err.message);
  }
  // Seed default maintaining balance setting
  try {
    const existingSetting = await store.query("SELECT * FROM settings WHERE key = 'default_maintaining_balance'");
    if (!existingSetting.rows.length) {
      await store.query("INSERT INTO settings (key, value) VALUES ('default_maintaining_balance', '100')");
      console.log('Default maintaining balance set to PHP 100');
    }
  } catch (_) {}
}

(async () => {
  if (isPostgres) {
    await store._ensureSchema();
  }
  await ensureDb();
  await ensureAdmin();
  await ensureSavingsProduct();
  startServer();
})();
const accountsRouter = require('./routes/accounts');
const goalsRouter = require('./routes/goals');
const badgesRouter = require('./routes/badges');
const transactionsRouter = require('./routes/transactions');
const excelRouter = require('./routes/excel');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const microbankRouter = require('./routes/admin-microbank');
const advancedRouter = require('./routes/admin-advanced');
const coopRouter = require('./routes/coop');
const gamesRouter = require('./routes/games');
const shopRouter = require('./routes/shop');
const quizRouter = require('./routes/quiz');
const adminAuthRouter = require('./routes/admin-auth');
const loansRouter = require('./routes/loans');
const bankingFeaturesRouter = require('./routes/banking-features');
const fcmRouter = require('./routes/fcm');
const boardRouter = require('./routes/board');
const leaderboardRouter = require('./routes/leaderboard');
const paymongoRouter = require('./routes/paymongo');
const settingsRouter = require('./routes/settings');
const kycRouter = require('./routes/kyc');
const { webhookRouter } = require('./routes/paymongo');
const { startScheduler } = require('./services/scheduler');
const { authMiddleware, requireOwnership } = require('./middleware/auth');

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-secure-random-string-in-production') {
    console.error('FATAL: JWT_SECRET must be set in production. Generate one: openssl rand -hex 32');
    process.exit(1);
  }
  if (!SESSION_SECRET || SESSION_SECRET === 'labcoop-session-secret-2026') {
    console.error('FATAL: SESSION_SECRET must be set in production. Generate one: openssl rand -hex 32');
    process.exit(1);
  }
} else {
  if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-secure-random-string-in-production') {
    const generated = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = generated;
    console.warn('WARN: JWT_SECRET not configured. Generated a temporary random secret (will change on restart).');
  }
  if (!SESSION_SECRET || SESSION_SECRET === 'labcoop-session-secret-2026') {
    const generated = crypto.randomBytes(32).toString('hex');
    process.env.SESSION_SECRET = generated;
    console.warn('WARN: SESSION_SECRET not configured. Generated a temporary random secret (will change on restart).');
  }
}
if (!process.env.PORT) {
  console.warn('PORT not set, defaulting to 3000');
}

function startServer() {
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'code.jquery.com', 'cdn.datatables.net', 'cdn.jsdelivr.net'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.datatables.net', 'cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'https://*'],
      fontSrc: ["'self'", 'cdnjs.cloudflare.com', 'data:'],
      connectSrc: ["'self'", 'cdn.jsdelivr.net'],
      formAction: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'https://labcoop-backend.onrender.com'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('dev'));

let sessionStore;
if (isPostgres) {
  const pgSession = require('connect-pg-simple')(session);
  sessionStore = new pgSession({ pool: store.getPool(), tableName: 'session', createTableIfMissing: true });
}
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 86400000, sameSite: 'strict' },
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/', (req, res) => {
  res.json({
    name: 'LabCoop API',
    version: '1.0.3',
    build: Date.now(),
    endpoints: {
      health: 'GET /api/health',
      accounts: {
        get: 'GET /api/accounts/:accountId',
        update: 'PUT /api/accounts/:accountId',
        deposit: 'PUT /api/accounts/:accountId/deposit',
      },
      goals: {
        list: 'GET /api/accounts/:accountId/goals',
        create: 'POST /api/goals',
        update: 'PUT /api/goals/:goalId',
        delete: 'DELETE /api/goals/:goalId',
      },
      badges: {
        list: 'GET /api/accounts/:accountId/badges',
        checkUnlocks: 'POST /api/badges/check-unlocks',
      },
      transactions: {
        list: 'GET /api/accounts/:accountId/transactions',
        create: 'POST /api/transactions',
        statement: 'GET /api/accounts/:accountId/statement',
      },
      microbanking: {
        loanProducts: 'GET /api/loan-products',
        savingsProducts: 'GET /api/savings-products',
        loans: 'GET /api/loans?account_id=xxx',
        apply: 'POST /api/loans/apply',
        approve: 'PUT /api/loans/:loanId/approve',
        disburse: 'PUT /api/loans/:loanId/disburse',
        pay: 'POST /api/loans/:loanId/pay',
        payments: 'GET /api/loans/:loanId/payments',
        preview: 'POST /api/loans/preview',
        summary: 'GET /api/accounts/:accountId/summary',
      },
      excel: {
        upload: 'POST /api/excel/upload',
        uploadAndSeed: 'POST /api/excel/upload-and-seed',
        template: 'GET /api/excel/template',
        exportAll: 'GET /api/excel/export/all',
      },
      admin: 'GET /admin',
      coop: {
        goals: 'GET /api/coop/goals',
        create: 'POST /api/coop/goals',
        contribute: 'POST /api/coop/goals/:goalId/contribute',
      },
      games: {
        list: 'GET /api/games',
        categories: 'GET /api/games/categories',
        detail: 'GET /api/games/:id',
      },
      quiz: {
        list: 'GET /api/quiz/questions?difficulty=easy|medium|hard|expert',
        create: 'POST /api/quiz/questions',
        update: 'PUT /api/quiz/questions/:id',
        delete: 'DELETE /api/quiz/questions/:id',
      },
    },
  });
});

app.use('/api/auth', loginLimiter, authRouter);

app.use('/api/accounts', authMiddleware, requireOwnership, accountsRouter);
app.get('/api/accounts/:accountId/goals', authMiddleware, requireOwnership, (req, res, next) => {
  req.url = `/account/${req.params.accountId}`;
  next();
}, goalsRouter);
app.use('/api/goals', authMiddleware, requireOwnership, goalsRouter);
app.get('/api/accounts/:accountId/badges', authMiddleware, requireOwnership, (req, res, next) => {
  req.url = `/account/${req.params.accountId}`;
  next();
}, badgesRouter);
app.use('/api/badges', authMiddleware, requireOwnership, badgesRouter);
app.get('/api/accounts/:accountId/transactions', authMiddleware, requireOwnership, (req, res, next) => {
  req.url = `/account/${req.params.accountId}`;
  next();
}, transactionsRouter);
app.get('/api/accounts/:accountId/statement', authMiddleware, requireOwnership, (req, res, next) => {
  req.url = `/statement/${req.params.accountId}`;
  next();
}, transactionsRouter);
app.use('/api/transactions', authMiddleware, requireOwnership, transactionsRouter);
app.use('/api/excel', authMiddleware, excelRouter);
app.use('/api/coop', authMiddleware, requireOwnership, coopRouter);
// Uploaded files (KYC, registration) are served via authenticated route only — see /api/files/*
// NEVER use express.static for user-uploaded content — it bypasses auth
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/shop', authMiddleware, shopRouter);
app.use('/api/quiz', authMiddleware, quizRouter);
app.use('/api/games', authMiddleware, gamesRouter);

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    if (isPostgres) {
      await store.query('SELECT 1');
    } else {
      const db = require('./db').getDb();
      db.prepare('SELECT 1').get();
    }
    dbOk = true;
  } catch (_) {}
  const paymongoConfigured = !!(process.env.PAYMONGO_SECRET);
  res.json({
    status: 'ok',
    dbConnected: dbOk,
    paymongoConfigured,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/test-paymongo-key', async (req, res) => {
  const paymongo = require('./services/paymongo');
  if (!paymongo.isPaymongoConfigured()) {
    return res.json({ configured: false, message: 'PAYMONGO_SECRET not set' });
  }
  try {
    // Try to retrieve a non-existent payment intent to test the key
    const result = await paymongo.retrievePaymentIntent('test_0000000000');
    res.json({ configured: true, apiReachable: true, result: 'Unexpected success' });
  } catch (e) {
    // PayMongo returns 404 for non-existent PI, which means key works
    if (e.message.includes('404') || e.message.includes('not found')) {
      res.json({ configured: true, apiReachable: true, message: 'Key is valid (got 404 as expected)' });
    } else {
      res.json({ configured: true, apiReachable: false, error: e.message });
    }
  }
});

// ── Clear all user data (keep reference tables) — requires super_admin role ──
app.post('/reset-database', async (req, res) => {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (req.session.adminRole !== 'super_admin') {
    const { log } = require('./services/audit');
    await log(req, 'reset_database_denied', 'system', null, { reason: 'insufficient_role', role: req.session.adminRole });
    return res.status(403).json({ success: false, message: 'Only super_admin can reset the database' });
  }
  const tables = ['gl_entries','loan_payments','transactions','badges','goal_jars','loans','withdrawal_requests','standing_orders','savings_applications','coop_contributions','coop_goals','accounts'];
  try {
    if (isPostgres) {
      const existing = await store.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
      );
      const existingSet = new Set(existing.rows.map(r => r.table_name));
      await store.transaction(async (tx) => {
        for (const t of tables) {
          if (existingSet.has(t)) {
            await tx.query(`DELETE FROM "${t}"`);
          }
        }
      });
    } else {
      for (const t of tables) {
        try { store.query(`DELETE FROM ${t}`); } catch (_) {}
      }
    }
    // Clean up uploaded KYC files
    const kycDir = path.join(__dirname, 'uploads', 'kyc');
    if (fs.existsSync(kycDir)) {
      const files = fs.readdirSync(kycDir);
      for (const f of files) {
        try { fs.unlinkSync(path.join(kycDir, f)); } catch (_) {}
      }
    }
    const { log } = require('./services/audit');
    await log(req, 'reset_database', 'system', null, { tables });
    res.json({ success: true, message: 'Database reset successful' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use('/api/webhooks', webhookRouter);
app.use('/api', authMiddleware, requireOwnership, loansRouter);
app.use('/api', authMiddleware, requireOwnership, bankingFeaturesRouter);
app.use('/api/fcm', fcmRouter);
app.use('/api/kyc', kycRouter);
app.use('/api/board', boardRouter);
app.use('/api/leaderboard', authMiddleware, leaderboardRouter);
app.use('/api/paymongo', paymongoRouter);
app.use('/api/settings', authMiddleware, requireOwnership, settingsRouter);

// ── Authenticated file serving — replaces express.static for uploads ──
app.use('/uploads', authMiddleware, (req, res, next) => {
  express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny',
    index: false,
    setHeaders: (res) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Cache-Control', 'private, max-age=3600');
    },
  })(req, res, next);
});
// ── CSRF protection for admin session routes (header-only, no body/query fallback) ──
function csrfProtection(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.session?.csrfToken;
  if (!cookieToken || !headerToken || headerToken !== cookieToken) {
    return res.status(403).json({ message: 'CSRF token mismatch. Reload the page and try again.' });
  }
  next();
}
// Inject CSRF token into all admin page renders
app.use('/admin', (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});
// Inject CSRF into all admin HTML forms via script
app.use('/admin', (req, res, next) => {
  const origSend = res.send.bind(res);
  res.send = function(body) {
    if (typeof body === 'string' && body.includes('</body>') && res.locals.csrfToken) {
      body = body.replace('</body>', `<script>document.querySelectorAll('form').forEach(f=>{const i=document.createElement('input');i.type='hidden';i.name='_csrf';i.value='${res.locals.csrfToken}';f.appendChild(i)})</script>\n</body>`);
    }
    return origSend(body);
  };
  next();
});
app.use('/admin', adminAuthRouter);
app.use('/admin', csrfProtection, adminRouter);
app.use('/admin', csrfProtection, microbankRouter);
app.use('/admin', csrfProtection, advancedRouter);

// ── Custom 404 — Lottie animation directly embedded ──
const lottieData = JSON.stringify(require('../public/404.json'));
app.use((req, res, next) => {
  if (res.headersSent) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>404</title>
<script src="https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js"></script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0d2818; min-height:100vh; display:flex; align-items:center; justify-content:center; }
#lottie-box { width:100vw; height:100vh; }
</style></head>
<body>
<div id="lottie-box"></div>
<script>
try {
  lottie.loadAnimation({container:document.getElementById('lottie-box'),animationData:${lottieData},loop:true,autoplay:true});
} catch(e){}
</script>
</body></html>`);
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ message: 'Internal server error' });
  } else {
    res.status(500).json({ message: 'Internal server error', error: err.message, type: err.type });
  }
});

  // Ensure upload directories exist
  const dirs = ['uploads', 'uploads/profiles', 'uploads/kyc'];
  for (const d of dirs) {
    const p = path.join(__dirname, d);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

app.listen(PORT, () => {
  console.log(`LabCoop API server running on port ${PORT}`);
  startScheduler();
});

module.exports = app;
}
