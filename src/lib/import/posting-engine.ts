import { db } from '@/lib/db';
import {
  stagedTransactions, journalEntries, journalEntryLines, accounts, auditLog, AUDIT_EVENTS
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// ACCOUNT CODE → UUID MAP (real Neon UUIDs)
// ---------------------------------------------------------------------------
const ACCOUNT_IDS: Record<string, string> = {
  '1011': 'ea3dc024-95ca-412d-90d7-ab93a0de4ea9',
  '1012': '89fb9b6a-634e-44b2-b98a-535bf4988e5a',
  '1013': '26f24223-a34d-42f0-9cc8-81e049b233d8',
  '1014': '55a0b455-9512-4ba9-a063-1bab7fdee6d7',
  '1015': '3a9dc5de-be96-46a9-b4ef-fee55bb928c7',
  '1016': 'af26b25b-5fb4-478b-91a9-6ccc6fa5efd6',
  '1021': '80013b42-5941-4b38-8c22-c6f2f629f29e',
  '1022': '9aac19c1-a48d-4e78-ac50-7d88711ddc54',
  '2011': 'b01b6747-c5e4-45f1-8bfd-3499388d5108',
  '2012': 'c653eb83-ca2d-49e7-9a73-4c9934bb2b73',
  '2013': '8ad3001a-486d-498a-ab5c-c1582915025f',
  '2014': '8bbe8b88-e09b-411f-9dd8-0d23970726da',
  '2015': '0b1b5aeb-7442-4cb8-9df5-b32ded9a5c33',
  '2023': '0954bdd3-7e01-46cb-a7f6-e42ea097962f',
'2024': 'a2640d30-cd24-42d7-a597-9f10b6256abc',
  '2025': 'c4ef492e-95f8-46a0-8605-c3ae12b3f712',
  '6104': '41f69001-6d60-424b-b96c-0ac4624c3a9e',
  '6105': '9935c65c-f072-49f8-93b7-554374813e51',
  '6106': '48f5c6d2-a442-4bcd-bcc2-7f101f5a19e8',
  '6107': '86ae4a8c-5fd7-478f-a77f-add4fe4524e7',
  '6108': 'eddc466f-14f6-476b-8abb-fffdb231aee1',
  '6109': '1f361e72-9ee7-4a06-ba9c-527fbb03178f',
  '6110': '6ea69e7e-1c78-4612-bc74-d667989f93bf',
  '6111': '4741fb55-e4ba-421b-be4d-29abd1e528a3',
  '6112': '80234fde-9bca-43de-8c82-48b8e3a9f248',
  '2026': '3be070fa-8f94-4e84-8017-42057dce6c34',
  '6113': '43f72adc-d897-4554-a6a7-3498978b28c6',
  '6114': 'eb6ecd5c-e76c-4a3b-b8f8-69a2c6865473',
  '6115': '25e043d1-f8c0-4f82-bbaf-d4e62dd34f37',
  '6116': '9450d8a6-f96d-4281-a320-11a17ec57af1',
  '6117': '9d294101-f8e8-44a2-adb1-ceb85fe7de6e',
  '6118': 'ab82db50-d1da-42f2-936f-a3407ec7e8de',
  '6119': 'd0550011-f466-4667-ae00-0b7002413b3f',
  '5045': '50aa9ab9-89c3-4c42-bc56-9e83ba68758e',
  '5046': '9f16dcac-c598-48f3-ae50-70dc60186152',
  '5047': '2dad06ac-6755-42ab-95cd-d5226f60f01a',
  '5048': '4009c7e6-3c20-4aa1-8584-e900e600031a',
  '6120': '3dc5440d-e8b8-4c0b-843a-825075f81c34',
  '6121': '80b0b74b-23bd-4d8d-a3e7-0de83ef53312',
  '4013': 'e4e16fca-1a7f-4f26-a624-eb2cacab2499',  
'2031': '3d2b2b39-a254-4c94-a090-0f67cba1694a',
  '3030': 'dd9a2abc-7f30-4182-9de2-90b76e296efa',
  '4011': '09d54433-1d16-46aa-ac4b-6d8c57003e70',
  '4032': 'e75f6c49-e54c-4503-b0b5-ff895eb0bd4f',
  '4041': '058280a9-b522-4b3b-9c2e-c99cd17532fc',
  '5011': 'de0fec66-e14d-4254-b4ca-5ee51af95710',
  '5031': '1e305bbf-c29e-4429-83d3-4552f98175a6',
  '5032': 'a6de4123-31b1-4dcc-a812-a0fb9e4719d6',
  '5033': '59671622-c88d-497d-99a2-dd72629a91ae',
  '5044': 'd445e2a1-0739-4c18-8573-55ce8022e30e',
  '5071': '04daf78f-8324-4058-be20-72ec905232fe',
  '5081': '337a70fc-ace5-47b3-8969-41f7a03ac40f',
  '6035': '29a25efb-ae29-49e1-9476-7ff4b5435a8c',
  '6081': 'f87bcb45-1350-45c0-9554-d3d345a701ba',
  '6091': '1a7968c7-0f6b-4cc0-aebc-d8c57e4bdf5d',
  '6103': 'a01f6e7e-c9d8-4eb3-a335-830d81058a1f',
};

// ---------------------------------------------------------------------------
// CATEGORY CODE → ACCOUNT CODE (from parser output)
// ---------------------------------------------------------------------------
const CATEGORY_TO_ACCOUNT: Record<string, string> = {
  '4011': '4011', '4021': '4032', '1041': '1021',
  '5011': '5011', '5021': '5021', '5031': '5031',
  '5041': '5031', '5061': '6081', '5071': '6035',
  '5081': '5071', '5082': '5032', '5091': '5044',
  '5101': '5041', '6021': '6103',
};

// ---------------------------------------------------------------------------
// DESCRIPTION-BASED POSTING RULES
// ---------------------------------------------------------------------------
interface PostingRule {
  pattern: RegExp;
  debitCode?: string;
  creditCode?: string;
  isTransfer?: boolean;
  transferToCode?: string;
  isCCPayment?: boolean;
  liabilityCode?: string;
  isTransferIn?: boolean;
  sourceCode?: string;
}

const DESCRIPTION_RULES: PostingRule[] = [
  // PAYROLL
  { pattern: /from wells fargo bank/i,       debitCode: '1011', creditCode: '4011' },
  { pattern: /from wells fargo ifi/i,        debitCode: '1011', creditCode: '4011' },
  // RENTAL INCOME
  { pattern: /homes plus realt/i,            debitCode: '1014', creditCode: '4032' },
  { pattern: /pmt from sabin thapa/i,        debitCode: '1015', creditCode: '4032' },
  // INTEREST
  { pattern: /^interest payment$/i,          debitCode: '1014', creditCode: '4041' },
  // RENTAL MORTGAGES
  { pattern: /prmi payments.*0251/i,         debitCode: '5014', creditCode: '1011' },
  { pattern: /prmi payments.*4937/i,         debitCode: '5015', creditCode: '1011' },
  // HOUSING
  { pattern: /nsm dbamr.cooper|nsm.*cooper/i,debitCode: '5011', creditCode: '1015' },
  { pattern: /cpenergy|centerpoint/i,        debitCode: '5031', creditCode: '1015' },
  { pattern: /electronic withdrawal to city of blaine/i, debitCode: '5031', creditCode: '1015' },
  { pattern: /comcast|xfinity/i,             debitCode: '5032', creditCode: '1015' },
  { pattern: /concertfin/i,                  debitCode: '5033', creditCode: '1015' },
  // PHONE
  { pattern: /t-mobile|tmobile/i,            debitCode: '5071', creditCode: '1015' },
  { pattern: /pmt to saurav shrestha/i,      debitCode: '5071', creditCode: '1011' },
  // INSURANCE
  { pattern: /nationwide/i,                  debitCode: '5044', creditCode: '1015' },
  // BNPL
  { pattern: /affirm/i,                      debitCode: '5048', creditCode: '1011' },
  { pattern: /atgpay/i,                      debitCode: '5048', creditCode: '1011' },
  // SUBSCRIPTIONS
  { pattern: /to subscription/i,             debitCode: '6035', creditCode: '1011' },
  // GYM
  { pattern: /fitness abc|xperience fitnes/i, debitCode: '6081', creditCode: '1011' },
  // INVESTMENTS
  { pattern: /to acorns invest/i,            isTransfer: true, transferToCode: '1021' },
  { pattern: /to acorns later/i,             isTransfer: true, transferToCode: '1022' },
  // AMAZON
  { pattern: /amazon\.com/i,                 debitCode: '6081', creditCode: '2012' },
  // MISC PERSONAL
  // AI & TECH (additional)
  { pattern: /perplexity/i,                                         debitCode: '6113', creditCode: '2016' },
  { pattern: /runwayml|runway standard plan/i,                      debitCode: '6113', creditCode: '2014' },
  { pattern: /predis\.ai/i,                                         debitCode: '6113', creditCode: '2016' },
  // SUBSCRIPTIONS (additional)
  { pattern: /kindle svcs/i,                                        debitCode: '6035', creditCode: '2014' },
  { pattern: /charged to standard purch/i,                          debitCode: '5081', creditCode: '2014' },
  { pattern: /mailchimp/i,                                          debitCode: '6035', creditCode: '2014' },
  { pattern: /sling tv/i,                                           debitCode: '6035', creditCode: '2014' },
  { pattern: /wmt plus/i,                                           debitCode: '6035', creditCode: '2014' },
  { pattern: /paypal.*google/i,                                     debitCode: '6035', creditCode: '1015' },
  // MEDICAL (additional)
  { pattern: /cvs\/pharmacy/i,                                      debitCode: '5045', creditCode: '2014' },
  { pattern: /an adapthealth|adapthealth/i,                         debitCode: '5045', creditCode: '2014' },
  // MEALS (additional)
  { pattern: /arbys/i,                                              debitCode: '6112', creditCode: '2014' },
  { pattern: /popeyes/i,                                            debitCode: '6112', creditCode: '2014' },
  { pattern: /shoreview cafe/i,                                     debitCode: '6112', creditCode: '2016' },
  { pattern: /red cow/i,                                            debitCode: '6112', creditCode: '2014' },
  { pattern: /skyway wok/i,                                         debitCode: '6112', creditCode: '2014' },
  { pattern: /chipotle/i,                                           debitCode: '6112', creditCode: '2016' },
  { pattern: /dragon star oriental/i,                               debitCode: '5021', creditCode: '2014' },
  // HOME EXPENSES (misc artifacts)
  { pattern: /^402 -10\.00$/i,                                      debitCode: '6103', creditCode: '1016' },
  // SAVINGS TRANSFERS
  { pattern: /wings financial/i,                                     debitCode: '6121', creditCode: '1011' },
  { pattern: /wfcu des:direct db/i,                                  debitCode: '6121', creditCode: '1016' },
  // PDF ARTIFACTS
  { pattern: /^402 -10\.00$/,                                       debitCode: '6108', creditCode: '1016' },
  // ONLINE SHOPPING
  { pattern: /paypal \*justfab/i,                                   debitCode: '6118', creditCode: '2014' },
  { pattern: /paypal \*temu/i,                                      debitCode: '6118', creditCode: '2014' },
  { pattern: /electronic withdrawal to paypal/i,                    debitCode: '6118', creditCode: '1014' },
  // CRYPTO & INVESTMENT LOSS
  { pattern: /crypto tax.*koin/i,                                   debitCode: '6119', creditCode: '2016' },
  { pattern: /wfcu des:direct db/i,                                 debitCode: '6119', creditCode: '1016' },
  // USPS → Office & Commute
  { pattern: /usps po/i,                                            debitCode: '6116', creditCode: '2014' },
  // DOLLAR TREE → Home Improvement
  { pattern: /dollartree/i,                                         debitCode: '6108', creditCode: '2014' },
  // GAS & FUEL
  { pattern: /circle k dealer/i,                                    debitCode: '6117', creditCode: '2016' },
  { pattern: /circle k/i,                                           debitCode: '6117', creditCode: '1011' },
  // INTEREST INCOME
  { pattern: /^interest earned$/i,                                  debitCode: '1014', creditCode: '4041' },
  // AIRBNB INCOME
  { pattern: /electronic deposit from airbnb/i,                     debitCode: '1014', creditCode: '6120' },
  // AI SUBSCRIPTIONS
  { pattern: /anthropic/i,                                           debitCode: '6113', creditCode: '2016' },
  // FAMILY
  { pattern: /zelle instant pmt to tofunmi/i,                       debitCode: '6107', creditCode: '1011' },
  // OFFICE & COMMUTE
  { pattern: /wfestwncafe/i,                                        debitCode: '6116', creditCode: '2016' },
  { pattern: /denison parking/i,                                    debitCode: '6116', creditCode: '2016' },
  // PARTY & GIFTS
  { pattern: /ck holiday/i,                                         debitCode: '6110', creditCode: '1011' },
  // HOME IMPROVEMENT (additional)
  { pattern: /wm supercenter|walmart supercenter/i,                 debitCode: '6108', creditCode: '2016' },
  // GROCERIES on CC (additional stores)
  { pattern: /pooja grocers/i,                                      debitCode: '5021', creditCode: '2014' },
  { pattern: /sun foods inc/i,                                      debitCode: '5021', creditCode: '2014' },
  { pattern: /cub foods/i,                                          debitCode: '5021', creditCode: '2014' },
  // MEALS & ENTERTAINMENT (additional)
  { pattern: /tikka masala grill/i,                                 debitCode: '6112', creditCode: '2016' },
  { pattern: /great moon buffet/i,                                  debitCode: '6112', creditCode: '2014' },
  { pattern: /msp holy land/i,                                      debitCode: '6112', creditCode: '2014' },
  { pattern: /spo\*eggtastic/i,                                     debitCode: '6112', creditCode: '2014' },
  // AI & TECH SUBSCRIPTIONS
  { pattern: /pictory\*/i,                                          debitCode: '6113', creditCode: '2014' },
  { pattern: /heygen technology/i,                                  debitCode: '6113', creditCode: '2014' },
  // CAR & REGISTRATION
  { pattern: /gov\*anokalicense/i,                                  debitCode: '6114', creditCode: '2014' },
  // CAMPING & RECREATION
  { pattern: /grand marais campground/i,                            debitCode: '6115', creditCode: '2014' },
  // HOME IMPROVEMENT (additional)
  { pattern: /menards/i,                                            debitCode: '6108', creditCode: '2014' },
  // APPLE CARD PAYMENT
  { pattern: /applecard gsbank des:payment/i,                       isCCPayment: true, liabilityCode: '2026' },
  // ONLINE SCHEDULED PAYMENT TO BOA CC
  { pattern: /online scheduled payment to acct# 3463/i,            isCCPayment: true, liabilityCode: '2014' },
  { pattern: /online scheduled payment to acct# 5787/i,            isCCPayment: true, liabilityCode: '2016' },
  // ZELLE FROM SUJAN (phone reimbursement)
  { pattern: /zelle from shrestha sujan.*phone/i,                   debitCode: '1011', creditCode: '5071' },
  { pattern: /zelle from shrestha sujan/i,                          debitCode: '1011', creditCode: '4041' },
  // XUNO ELECTRONIC WITHDRAWAL
  { pattern: /electronic withdrawal to xuno/i,                      debitCode: '6107', creditCode: '1014' },
  // INTERNAL TRANSFERS BofA CHK→SAV
  { pattern: /automatic transfer to sav 6951/i,                    isTransfer: true, transferToCode: '1020' },
  { pattern: /automatic transfer from chk 1961/i,                  isTransferIn: true, sourceCode: '1016' },
  // GROCERIES
  { pattern: /costco gas/i,                                          debitCode: '6117', creditCode: '2013' },
  { pattern: /costco warehouse/i,                                   debitCode: '5021', creditCode: '2013' },
  // MEALS & ENTERTAINMENT
  { pattern: /g-will liquors/i,                                     debitCode: '6112', creditCode: '2016' },
  { pattern: /red's savoy pizza/i,                                  debitCode: '6112', creditCode: '2016' },
  // AI & TECH SUBSCRIPTIONS
  { pattern: /claude\.ai subscription/i,                            debitCode: '6113', creditCode: '2016' },
  { pattern: /chatgpt|openai/i,                                     debitCode: '6113', creditCode: '2016' },
  { pattern: /emergent\.sh|emergent emergent/i,                     debitCode: '6113', creditCode: '2016' },
  // FAMILY EXPENSES
  { pattern: /zelle to shrestha nepali/i,                           debitCode: '6107', creditCode: '1011' },
  // LIFE INSURANCE
  { pattern: /nylife of arizon/i,                                   debitCode: '6111', creditCode: '1015' },
  // MEALS & ENTERTAINMENT
  { pattern: /spo\*eggtasticbrunchcafe/i,                           debitCode: '6112', creditCode: '2014' },
  // PARKING → Personal Travel
  { pattern: /mac parking reservations/i,                           debitCode: '6106', creditCode: '2014' },
  // AT&T DEVICE → Phone
  { pattern: /at&t device\/equip ship/i,                            debitCode: '5071', creditCode: '2014' },
  // CONNEXUS ENERGY → Utilities
  { pattern: /electronic withdrawal to connexus energy/i,           debitCode: '5031', creditCode: '1015' },
  // WALMART → Home Improvement
  { pattern: /wal-mart/i,                                           debitCode: '6108', creditCode: '2016' },
  // BOOK PROMOTION
  { pattern: /bookreverb/i,                                         debitCode: '6109', creditCode: '2016' },
  { pattern: /amz\*goodreads/i,                                     debitCode: '6109', creditCode: '2016' },
  // PROFESSIONAL DEVELOPMENT
  { pattern: /toastmasters/i,                                       debitCode: '6105', creditCode: '2014' },
  { pattern: /linkedinpre/i,                                        debitCode: '6105', creditCode: '2016' },
  { pattern: /sp mountain goat sof/i,                               debitCode: '6105', creditCode: '2014' },
  { pattern: /scrum alliance/i,                                     debitCode: '6105', creditCode: '2016' },
  // USB CC PAYMENT
  { pattern: /mobile banking payment to credit card.*0546/i,        isCCPayment: true, liabilityCode: '2025' },
  // CARDMEMBER SERV (Chase CC payment or donation)
  { pattern: /electronic withdrawal to cardmember serv/i,           isCCPayment: true, liabilityCode: '2012' },
  // JAY LAMSAL → Rental/maintenance expense
  { pattern: /zelle instant pmt to jay lamsal/i,                    debitCode: '6120', creditCode: '1011' },
  // PROFESSIONAL DEVELOPMENT
  { pattern: /zelle payment to gopu shrestha.*resume builder/i,  debitCode: '6105', creditCode: '1016' },
  { pattern: /paypal \*beverlyanne/i,                             debitCode: '6105', creditCode: '2014' },
  // PERSONAL TRAVEL
  { pattern: /american air\d+/i,                                  debitCode: '6106', creditCode: '2016' },
  { pattern: /zelle to laxmi pandey.*camping/i,                   debitCode: '6115', creditCode: '1011' },
  // FAMILY EXPENSES
  { pattern: /xuno debit/i,                                       debitCode: '6107', creditCode: '1011' },
  // HOME IMPROVEMENT
  { pattern: /the home depot/i,                                   debitCode: '6108', creditCode: '2014' },
  // BOOK WRITING
  { pattern: /fiverr/i,                                           debitCode: '6109', creditCode: '2014' },
  // PARTY GIFT DONATION
  { pattern: /atm withdrawal holiday store/i,                     debitCode: '6110', creditCode: '1014' },
  // MOBILE DEPOSITS (refunds/returns)
  { pattern: /bkofamerica mobile.*deposit/i,                      debitCode: '1016', creditCode: '4012' },
  { pattern: /holiday store/i,               debitCode: '6103', creditCode: '1011' },
  { pattern: /pmt to jay lamsal/i,           debitCode: '6120', creditCode: '1011' },

  { pattern: /wfcu direct db/i,              debitCode: '6121', creditCode: '1011' },
  // SYNCHRONY / SAM'S CLUB
  { pattern: /online payment thank you/i,    isCCPayment: true, liabilityCode: '2015' },
  { pattern: /online payment, thank you/i,      isCCPayment: true, liabilityCode: '2013' },
  { pattern: /automatic payment - thank you/i,   isCCPayment: true, liabilityCode: '2012' },
  { pattern: /sam's club \d+/i,             debitCode: '5021', creditCode: '2015' },
  { pattern: /google.*google one/i,          debitCode: '6035', creditCode: '2015' },
  { pattern: /interest charge/i,             debitCode: '5081', creditCode: '2015' },
  // INTEREST CHARGES (all credit cards — debit to interest expense 5081)
  { pattern: /purchase interest charge/i,    debitCode: '5046', creditCode: '2012' },
  { pattern: /interest charge on purchases/i,debitCode: '5046', creditCode: '2013' },
  { pattern: /interest charge on cash/i,     debitCode: '5046', creditCode: '2013' },
  { pattern: /interest charge/i,             debitCode: '5046', creditCode: '2012' },
  { pattern: /periodic rate/i,               debitCode: '5046', creditCode: '2015' },
  { pattern: /minimum interest/i,            debitCode: '5046', creditCode: '2015' },
  // CC PAYMENTS
  { pattern: /chase credit crd epay/i,       isCCPayment: true, liabilityCode: '2012' },
  { pattern: /citi card online payment/i,    isCCPayment: true, liabilityCode: '2013' },
  { pattern: /wf credit card auto pay/i,     isCCPayment: true, liabilityCode: '2014' },
// PAYROLL appearing in non-WF accounts
  { pattern: /wells fargo bank des:payroll/i,                          creditCode: '4011' },
{ pattern: /wells fargo bank des:payrll dep/i,                     creditCode: '4011' },
  { pattern: /bestify tax advi/i,                                     debitCode: '5047', creditCode: '1016' },
  { pattern: /electronic withdrawal to citi card online/i,            isCCPayment: true, liabilityCode: '2013' },
{ pattern: /wells fargo bank payroll/i,                    creditCode: '4011' },
  { pattern: /mobile banking payment to crd 5787/i,          isCCPayment: true, liabilityCode: '2016' },
  { pattern: /mobile banking payment to crd 3463/i,          isCCPayment: true, liabilityCode: '2014' },
  { pattern: /mobile banking payment to crd 9292/i,          isCCPayment: true, liabilityCode: '2014' },
  // BOA CC 5787 payments
  { pattern: /online banking payment to crd 5787/i,                    isCCPayment: true, liabilityCode: '2016' },
  { pattern: /online payment from chk.*5787/i,                         isCCPayment: true, liabilityCode: '2016' },
 { pattern: /online banking payment to crd 3463/i,           isCCPayment: true, liabilityCode: '2014' },
  { pattern: /online banking payment to crd 9292/i,           isCCPayment: true, liabilityCode: '2014' },
  { pattern: /online payment from chk.*3463/i,                isCCPayment: true, liabilityCode: '2014' },
  { pattern: /online payment from chk.*9292/i,                isCCPayment: true, liabilityCode: '2014' },
{ pattern: /zelle payment from gopu shrestha.*book and promotion/i, debitCode: '1016', creditCode: '6104' },
  { pattern: /zelle payment from gopu shrestha.*phone payment/i,      debitCode: '1016', creditCode: '5071' },
  { pattern: /zelle payment from gopu shrestha.*pay credit card/i,    isTransferIn: true, sourceCode: '1011' },
  { pattern: /zelle payment from gopu shrestha.*cc payment/i,         isTransferIn: true, sourceCode: '1011' },
  { pattern: /zelle payment from gopu shrestha.*t.?mobile/i,          debitCode: '1011', creditCode: '5071' },
  { pattern: /zelle payment from gopu shrestha/i,                     isTransferIn: true, sourceCode: '1011' },
  // GROCERIES on CC
  { pattern: /aldi\s+\d+/i,                                   debitCode: '5021', creditCode: '2014' },
 { pattern: /bank of america credit card bill payment/i,              isCCPayment: true, liabilityCode: '2016' },
  { pattern: /^cc payment$/i,                                          isCCPayment: true, liabilityCode: '2016' },
  { pattern: /payment - thank you.*5787/i,                               isCCPayment: true, liabilityCode: '2016' },
  { pattern: /payment - thank you.*9292/i,                               isCCPayment: true, liabilityCode: '2014' },
  { pattern: /payment - thank you.*3463/i,                               isCCPayment: true, liabilityCode: '2014' },
  // CPA / PROFESSIONAL FEES
  { pattern: /zelle payment to santosh timilsina/i,                    debitCode: '5047', creditCode: '1015' },
  // ZELLE FROM SELF

{ pattern: /electronic withdrawal to wells fargo card/i, isCCPayment: true, liabilityCode: '2024' },
  { pattern: /wf credit card des:auto pay.*6317/i,              isCCPayment: true, liabilityCode: '2024' },
  { pattern: /electronic withdrawal to chase credit crd/i,    isCCPayment: true, liabilityCode: '2012' },
  { pattern: /real time payment to gopu shrestha/i,           isTransfer: true, transferToCode: '1014' },
  { pattern: /us bank.*credit card|usbank.*autopay/i,      isCCPayment: true, liabilityCode: '2025' },
  { pattern: /irs treas 310.*tax ref/i,                    creditCode: '4013' },
  { pattern: /mn dept of reven.*mnsttaxrfd/i,              creditCode: '4013' },
  { pattern: /cardmember serv.*web pymt/i,                 isCCPayment: true, liabilityCode: '2012' }, 

 { pattern: /to samsclub mstrcrd/i,         isCCPayment: true, liabilityCode: '2011' },
  // INTERNAL TRANSFERS — out
  { pattern: /to account \*{0,4}1353/i,      isTransfer: true, transferToCode: '1015' },
// US BANK INTERNAL TRANSFERS
  { pattern: /transfer to account 104788091353/i,   isTransfer: true, transferToCode: '1015' },
  { pattern: /transfer from account 104784156820/i, isTransferIn: true, sourceCode: '1014' },
  // ROCKET MORTGAGE
  { pattern: /electronic withdrawal to rocket mortgage/i, debitCode: '5011', creditCode: '1014' }, 
 { pattern: /recurring transfer to.*way2save/i, isTransfer: true, transferToCode: '1013' },
  { pattern: /pmt to gopu boa tm/i,          isTransfer: true, transferToCode: '1016' },
  { pattern: /zelle to boa gopu/i,           isTransfer: true, transferToCode: '1016' },
  // INTERNAL TRANSFERS — in
  { pattern: /from account \*{0,4}6820/i,    isTransferIn: true, sourceCode: '1014' },
  { pattern: /recurring transfer from.*checking/i, isTransferIn: true, sourceCode: '1011' },
  // ZELLE FROM FAMILY
  { pattern: /zelle from shrestha chini/i,   creditCode: '4041' },
  { pattern: /zelle from shrestha/i,           debitCode: '1011', creditCode: '6103' },
];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function resolveId(
  code: string,
  accountByCode: Map<string, { id: string; code: string }>
): string | null {
  const acct = accountByCode.get(code);
  if (acct) return acct.id;
  return ACCOUNT_IDS[code] ?? null;
}

// ---------------------------------------------------------------------------
// MAIN EXPORT
// ---------------------------------------------------------------------------
export interface PostingResult {
  posted: number;
  skipped: number;
  errors: string[];
}

export async function postStagedTransactions(
  batchId: string,
  userId: string,
  transactionIds?: string[]
): Promise<PostingResult> {
  const result: PostingResult = { posted: 0, skipped: 0, errors: [] };

  const whereClause = transactionIds
    ? inArray(stagedTransactions.id, transactionIds)
    : eq(stagedTransactions.batchId, batchId);

  const staged = await db.select().from(stagedTransactions).where(whereClause);
  const toPost = staged.filter(t => t.status === 'pending' && !t.journalEntryId);
  result.skipped = staged.length - toPost.length;

  if (!toPost.length) return result;

  const allAccounts = await db.select().from(accounts);
  const accountByCode = new Map(allAccounts.map(a => [a.code, a]));
  const accountById   = new Map(allAccounts.map(a => [a.id, a]));

  for (const txn of toPost) {
    try {
      const bankAccount = accountById.get(txn.accountId);
      if (!bankAccount) {
        result.errors.push(`Account not found for txn ${txn.id}`);
        result.skipped++;
        continue;
      }

      let debitAccountId: string | null = null;
      let creditAccountId: string | null = null;

      // 1. Description-based rules
      const desc = (txn.rawDescription ?? txn.description ?? '').trim();
      const rule = DESCRIPTION_RULES.find(r => r.pattern.test(desc));

      if (rule) {
        if (rule.isTransfer) {
          const otherId = resolveId(rule.transferToCode!, accountByCode);
          if (txn.direction === 'debit') {
            debitAccountId  = otherId;
            creditAccountId = bankAccount.id;
          } else {
            debitAccountId  = bankAccount.id;
            creditAccountId = otherId;
          }
        } else if (rule.isTransferIn) {
          debitAccountId  = bankAccount.id;
          creditAccountId = resolveId(rule.sourceCode!, accountByCode);
        } else if (rule.isCCPayment) {
          debitAccountId  = resolveId(rule.liabilityCode!, accountByCode);
          creditAccountId = bankAccount.id;
        } else {
          // Use bankAccount.id for the side matching transaction direction
          // Only use rule codes for the CONTRA account
          if (txn.direction === 'debit') {
            // Money leaving bank account: credit bank, debit expense/contra
            debitAccountId  = resolveId(rule.debitCode!, accountByCode);
            creditAccountId = bankAccount.id;
          } else {
            // Money entering bank account: debit bank, credit income/contra
            debitAccountId  = bankAccount.id;
            creditAccountId = resolveId(rule.creditCode!, accountByCode);
          }
        }
      }

      // 2. Category code fallback
      if (!debitAccountId || !creditAccountId) {
        const contraCode = txn.categoryCode
          ? (CATEGORY_TO_ACCOUNT[txn.categoryCode] ?? null)
          : null;
        const miscId = resolveId('6103', accountByCode)!;
        const isAsset = bankAccount.type === 'asset';
        const isLiability = bankAccount.type === 'liability';

        if (isLiability) {
          if (txn.direction === 'debit') {
            const exp = contraCode ? accountByCode.get(contraCode) : null;
            debitAccountId  = exp?.id ?? miscId;
            creditAccountId = bankAccount.id;
          } else {
            debitAccountId  = bankAccount.id;
            creditAccountId = miscId;
          }
        } else if (isAsset) {
          if (txn.direction === 'debit') {
            const exp = contraCode ? accountByCode.get(contraCode) : null;
            debitAccountId  = exp?.id ?? miscId;
            creditAccountId = bankAccount.id;
          } else {
            const inc = contraCode ? accountByCode.get(contraCode) : null;
            debitAccountId  = bankAccount.id;
            creditAccountId = inc?.id ?? miscId;
          }
        } else {
          result.errors.push(`Unknown account type for txn ${txn.id}`);
          result.skipped++;
          continue;
        }
      }

      if (!debitAccountId || !creditAccountId) {
        result.errors.push(`Could not resolve accounts for: ${desc}`);
        result.skipped++;
        continue;
      }

      // 3. Create journal entry
      const entryId = crypto.randomUUID();
      await db.insert(journalEntries).values({
        id:          entryId,
        entryDate:   new Date(txn.txnDate),
        description: txn.description,
        reference:   txn.batchId,
        createdBy:   userId,
      });

      await db.insert(journalEntryLines).values([
        { journalEntryId: entryId, accountId: debitAccountId,  amountCents: txn.amountCents, side: 'debit',  memo: txn.description },
        { journalEntryId: entryId, accountId: creditAccountId, amountCents: txn.amountCents, side: 'credit', memo: txn.description },
      ]);

      await db.update(stagedTransactions)
        .set({ status: 'posted', journalEntryId: entryId, postedAt: new Date() })
        .where(eq(stagedTransactions.id, txn.id));

      await db.insert(auditLog).values({
        userId,
        eventType:  AUDIT_EVENTS.TRANSACTION_POSTED,
        entityType: 'staged_transaction',
        entityId:   txn.id,
        payload:    { journalEntryId: entryId, status: 'posted' },
      });

      result.posted++;

    } catch (err) {
      result.errors.push(`Error posting txn ${txn.id}: ${String(err)}`);
      result.skipped++;
    }
  }

  // Update batch status to 'posted' if all transactions are now posted
  if (result.posted > 0) {
    const { importBatches } = await import('@/lib/db/schema/import-batches');
    await db.update(importBatches)
      .set({ status: 'posted' })
      .where(eq(importBatches.id, batchId));
  }

  return result;
}
