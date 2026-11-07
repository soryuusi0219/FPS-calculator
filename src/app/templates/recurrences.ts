import { sample, row, check } from './catalog.ts';

export const recurrenceTemplates = [
  sample('arithmetic','等差数列と有理母関数','recurrences','入門 OGF。初項・公差を編集し、ラムダ生成・線形漸化式・有理式を比較します。',[
    row('first=2','初項a_0。スカラーのパラメータです。'),row('step=3','公差d。a_n=first+step*n。'),
    row('F=fps(n=>first+step*n)','等差数列を通常係数として生成します。nは0から始まる添字です。'),
    row('G=linrec(2,seq(2,-1),seq(first,first+step))','a_n=2a_(n-1)-a_(n-2)という2階の同次漸化式でも同じ数列になります。'),
    row('H=first/(1-X)+step*X/(1-X)^2','ΣX^nとΣnX^nから得られる有理母関数です。'),check('F-G'),check('F-H'),
  ],{primary:2}),
  sample('geometric','等比数列と逆元','recurrences','入門 OGF。初項・公比を変更し、1階の線形漸化式と幾何級数を比較します。',[
    row('first=3','初項a_0。'),row('ratio=2','公比r。負数や0も指定できます。'),row('F=fps(n=>first*ratio^n)','a_n=first*ratio^n。n=0ではratio^0=1です。'),
    row('G=linrec(1,seq(ratio),seq(first))','a_n=ratio*a_(n-1)。'),check('F-G'),check('F-first/(1-ratio*X)'),
  ],{primary:2}),
  sample('fibonacci','Fibonacci数と有理式の復元','recurrences','入門 OGF。F_0=0,F_1=1。linrec・rationalGF・明示式を比べます。',[
    row('F=linrec(2,seq(1,1),seq(0,1))','F_n=F_(n-1)+F_(n-2)。最初の項は0,1,1,2,3,5,8,13です。'),
    row('G=X/(1-X-X^2)','漸化式にX^nを掛けて和を取ると得られる母関数です。'),check('F-G'),
    row('rationalGF(2,seq(1,1),seq(0,1))','同じ漸化式から分子・分母を復元する解析レポートです。「復元した有理式をノートに追加」も使えます。'),
  ]),
  sample('lucas','Lucas数：同じ漸化式の別の初期値','recurrences','入門 OGF。Lucas数とFibonacci数の違いは初期値です。',[
    row('L=linrec(2,seq(1,1),seq(2,1))','L_0=2,L_1=1。続く項は3,4,7,11,18,29です。'),check('L-(2-X)/(1-X-X^2)'),
  ]),
  sample('tribonacci','Tribonacci数と3階の漸化式','recurrences','入門 OGF。直前3項の和。初期値0,0,1の流儀を使います。',[
    row('T=linrec(3,seq(1,1,1),seq(0,0,1))','T_n=T_(n-1)+T_(n-2)+T_(n-3)、T_0=T_1=0,T_2=1。添字・初期値に異なる流儀があるので注意してください。'),
    check('T-X^2/(1-X-X^2-X^3)'),
  ]),
  sample('tilings','長さ1・2のタイル敷き','recurrences','入門 OGF。空の敷き方を1個として、Fibonacci数の添字ずれを確認します。',[
    row('F=1/(1-X-X^2)','長さnの列を長さ1と2のタイルで埋める個数。部品を並べる順序を区別します。空列n=0は1個です。'),
    row('G=linrec(2,seq(1,1),seq(1,1))','右端のタイルが1か2かで分ける漸化式です。FibonacciのF_(n+1)になります。'),check('F-G'),
  ]),
  sample('compositions','許される部品サイズと順序付き整数分割','recurrences','入門 OGF。列（SEQ）と整数分割の違い。有限総和・パラメータ編集。',[
    row('limit=3','使える部品サイズは1からlimitまで。正の小さい整数に変更してください。'),
    row('P=sum(1,limit,k=>X^k)','部品のサイズの母関数です。部品ごとに1種類ずつあるとします。'),
    row('F=1/(1-P)','任意個の部品を順序を区別して並べるので、1+P+P^2+…となります。n=0の空列は1個。'),check('F*(1-P)-1'),
  ],{primary:2}),
];
