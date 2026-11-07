import { sample, row, check } from './catalog.ts';

export const tutorialTemplates = [
  sample('ogf-egf','OGF/EGF：生成と表示は別の操作','recurrences','入門。fpsとegf、階乗による変換、範囲付き生成・係数抽出を比べます。',[
    row('F=fps(n=>1)','通常係数がすべて1のOGF：1/(1-X)。O.G.F./E.G.F.ボタンは表示基底だけを変更します。'),
    row('G=egf(n=>1)','重みa_n=1をa_n/n!へ変換して生成するのでexp(X)です。E.G.F.表示では全項1になります。'),
    check('G-exp(X)'),check('map(G,(a,n)=>a*n!)-F','通常係数をn!倍すると重みを通常係数として並べたFになります。mapも表示基底とは独立です。'),
    row('G[5]','係数抽出は常に通常係数なので、基底を切り替えても値は1/120です。'),
    row('H=egf(n=>1/n,1,3)','次数1〜3だけ生成します。範囲外ではラムダも除算も実行しないので、n=0の0除算を避けられます。'),
  ]),
  sample('sequence-transforms','Fibonacci数の変換：部分和・二項・Hadamard・抽出','recurrences','中級 OGF。数列変換と隣接係数map、次数による分岐。',[
    row('F=X/(1-X-X^2)','変換する元の数列F_0=0,F_1=1。'),row('S=partialSums(F)','係数nはF_0+…+F_n。'),
    row('B=binomialTransform(F)','係数nはΣ binom(n,k)F_k。'),check('inverseBinomialTransform(B)-F'),
    row('H=hadamard(F,F)','通常の級数の積ではなく、係数ごとの積F_n^2です。'),row('Even=even(F)','係数nはF_(2n)。'),row('Odd=odd(F)','係数nはF_(2n+1)。'),
    check('B-Even','Fibonacci数の二項変換は偶数番目の項の列と一致します。'),
    row('Every=extract(F,3,1)','係数nはF_(3n+1)。必要な入力精度は出力より高くなります。'),
    row('Next=map(F,(a,n)=>a[n+1])','a[j]は元のFのj次係数。出力の最高次でも隣接係数を失わないように再評価します。'),
    row('Mask=map(F,(a,n)=>n%2==0?a:0)','偶数次数だけ残し、次数は詰めません。even(F)との違いを確認してください。'),
  ]),
  sample('guess-compare','推測と比較：未使用項での検証','recurrences','中級。Fibonacci数の漸化式推測、検証不一致の例、有限精度の比較。',[
    row('Data=seq(0,1,1,2,3,5,8,13,21,34,55,89)','12項を入力します。seqは入力個数を保持するので、後ろに0を補って検証項を捏造しません。'),
    row('guess(Data,6,3)','最初の6項だけを学習し、最大3階で探します。残り6項は候補の検証だけに使います。一致しても無限の数列の証明ではありません。'),
    row('Bad=seq(0,1,1,2,3,99,8,13)','意図的に5番目の項を変更したデータです。'),
    row('guess(Bad,4,3)','最初の4項から得た候補は、学習に使わなかった項で不一致になります。エラーで停止せず解析レポートを表示します。'),
    row('guess(seq(0,0,1),2,3)','学習用の2項がともに0では一意な漸化式を決められません。情報不足を確認する例です。'),
    row('compare(linrec(2,seq(1,1),seq(0,1)),X/(1-X-X^2))','指定精度までの一致を確認します。数学的な恒等性の証明とは区別します。'),
  ]),
  sample('algebraic-system','Catalan数を明示的な連立方程式で解く','systems','中級 OGF。u=1+Xv、v=u^2。定数項と代入残差。',[
    row('u','上の連立欄を使います。未知数u,vの定数項を各1に指定した、通常FPSの正則な代数系です。'),
    row('v','vはCatalanの通常畳み込みの2乗です。'),check('u-Catalan'),check('u-1-X*v'),check('v-u^2'),
  ],{systems:[{variables:'u=1\nv=1',equations:'u=1+X*v\nv=u^2',method:'auto'}]}),
  sample('quadratic-branches','初期値で枝を選ぶ：F=F^2+X','systems','中級 OGF。同じ方程式の2つの定数項と、再帰の初期値欄。',[
    row('F=F^2+X','定数項0の枝。各行の「再帰の初期値」を開くと0が指定されています。','0'),
    row('G=G^2+X','定数項1の枝。同じ方程式でも初期値が違うと別の級数です。','1'),check('F+G-1'),check('F-X*Catalan'),
  ]),
  sample('exponential-ode','指数関数：微分方程式と積分再帰','systems','中級 OGF。u\'=u,u(0)=1とF=1+integral(F)を比べます。',[
    row('u','上の連立欄にdiff(u)=u、初期値u=1を入力しています。係数は1/n!です。'),
    row('F=1+integral(F)','積分定数を1にした再帰。integral自身の積分定数は0です。'),check('u-F'),check('u-exp(X)'),
  ],{systems:[{variables:'u=1',equations:'diff(u)=u',method:'auto'}]}),
  sample('harmonic-ode','sin・cos：連立微分方程式','systems','中級 OGF。s\'=c、c\'=-s、s(0)=0,c(0)=1。',[
    row('s','上の連立欄の解。初期値は通常係数で指定します。'),row('c','初期値c(0)=1でcosの枝になります。'),check('s-sin(X)'),check('c-cos(X)'),check('s^2+c^2-1'),
  ],{systems:[{variables:'s=0\nc=1',equations:'diff(s)=c\ndiff(c)=-s',method:'auto'}]}),
  sample('differential-recurrence','微分を含む次数順の再帰：階乗','systems','中級 OGF。F=1+diff(X^2*F)。微分があっても下の次数から決まる例。',[
    row('F=1+diff(X^2*F)','出力n次は(n+1)*F_(n-1)なので、係数は(n+1)!になります。初期定数項は式から1と決まります。'),
    row('G=fps(n=>(n+1)!)','指数母関数ではなく、階乗をそのまま通常係数にしたFPSです。'),check('F-G'),
  ]),
  sample('reversion-cycle','revertを含む循環：合成逆関数の係数依存','systems','発展 OGF。F=X+X*revert(F)。一次係数と未来参照の区別。',[
    row('F=X+X*revert(F)','revert(F)のn-1次までからFのn次を確定します。F(0)=0、F_1=1。先頭は0,1,1,-1,3,-13,69,-419。'),
    row('G=revert(F)','合成逆関数。定数項0・一次係数非零が必要です。次数nではなくF_1で割る方式なので、小さい素数modでも計算できます。'),
    check('F-X-X*G'),check('F(G)-X'),check('G(F)-X'),
  ],{terms:8}),
];
