import { sample, row, check } from './catalog.ts';

export const combinatoricsTemplates = [
  sample('derangements','Montmort数：完全順列','combinatorics','入門 EGF。固定点を持たない置換。包含排除と整数漸化式を比較します。',[
    row('F=exp(-X)/(1-X)','n個のラベル付き要素の完全順列D_nのEGF。D_0=1,D_1=0です。E.G.F.表示なので表はD_nを表示します。参考: https://oeis.org/A000166'),
    row('G=egf(recurrence(2,seq(1,0),(a,n)=>(n-1)*(a[n-1]+a[n-2])))','D_n=(n-1)(D_(n-1)+D_(n-2))を整数上で計算して、EGFへ変換します。'),check('F-G'),
  ],{basis:'egf'}),
  sample('bell','Bell数：集合分割と二重exp','combinatorics','入門 EGF。集合の集合を数えるexp(exp(X)-1)。Stirling数による定義と比較。',[
    row('F=exp(exp(X)-1)','各ブロックは空でないラベル付き集合（exp(X)-1）。その集合を作るので外側にもexpを使います。空集合の分割は1個。参考: https://oeis.org/A000110'),
    row('G=egf(n=>sum(0,n,k=>stirling2(n,k)))','n要素をkブロックに分ける第2種Stirling数の和から、同じEGFを生成します。'),check('F-G'),
  ],{basis:'egf'}),
  sample('bernoulli','Bernoulli数とx因子の相殺','combinatorics','入門 EGF。有理数のBernoulli数。B_1=-1/2の流儀とLaurent除算の追加精度。',[
    row('B=X/(exp(X)-1)','定義 ΣB_n X^n/n!=X/(exp(X)-1)。B_0=1,B_1=-1/2を採用します。表示をO.G.F.へ変えるとB_n/n!です。出典: https://dlmf.nist.gov/24.2'),
    check('B*(exp(X)-1)-X','分母の定数項は0ですが、x因子が相殺されて通常FPSになります。modでは内部で必要なexpの次数の分母も可逆である必要があります。'),
  ],{basis:'egf'}),
  sample('partitions','整数分割：無限積とEuler変換','combinatorics','入門 OGF。順序を区別しない整数分割p(n)。p(0)=1。',[
    row('P=prod(1,k=>1/(1-X^k))','大きさkの部分を0,1,2,…個選ぶ因子1/(1-X^k)の積です。各次数に寄与する因子は有限個。参考: https://oeis.org/A000041'),
    row('Q=eulerTransform(X/(1-X))','各正のサイズに部品が1種類ずつある場合の多重集合です。必要な整数で割れない小さいmodでは、上の直接の積を使ってください。'),check('P-Q'),
  ]),
  sample('catalan','Catalan数：組み込み・再帰・平方根','combinatorics','入門 OGF。C_0=1。二分木・Dyck路の数え上げを3通りで比較。',[
    row('C=Catalan','Catalan数1,1,2,5,14,42,…の母関数です。参考: https://oeis.org/A000108'),
    row('F=1+X*F^2','空の対象か、根と順序のある二つの部分木に分解する再帰です。定数項は1を選びます。','1'),
    row('G=(1-sqrt(1-4X))/(2X)','二次方程式を解いた通常FPSの枝です。xで割るため、入力の追加精度も必要です。'),check('C-F'),check('C-G'),
  ]),
  sample('franel','Franel数：二項係数の3乗和','combinatorics','中級 OGF。有限総和から多項式係数漸化式・微分方程式へ。',[
    row('F=fps(n=>sum(0,n,k=>nCk(n,k)^3))','3次Franel数f_n=Σ_{k=0}^n binom(n,k)^3。最初の項は1,2,10,56,346,2252。出典: https://oeis.org/A000172'),
    row('G=pRecursive(seq(1,2),-8*(X+1)^2,-7*(X+1)*(X+2)-2,(X+2)^2)','(n+2)^2 f_(n+2)=(7(n+1)(n+2)+2)f_(n+1)+8(n+1)^2 f_n。多項式引数のXは添字nを表します。'),check('F-G'),
    row('pRecGF(seq(1,2),-8*(X+1)^2,-7*(X+1)*(X+2)-2,(X+2)^2)','同じ漸化式から、初期値の境界項を含む母関数の微分方程式を復元します。'),
  ]),
  sample('catalan-convolution','Catalan convolution：r重通常畳み込み','combinatorics','中級 OGF。Catalan^rの係数を閉形式と比較。rは正の整数のパラメータ。',[
    row('r=3','通常畳み込みの回数。正の小さな整数に変更してください。EGFの二項係数付き畳み込みとは異なります。'),
    row('F=Catalan^r','r個のCatalan対象を順序を区別して並べた母関数です。r=3では1,3,9,28,90,…。'),
    row('G=fps(n=>r*nCk(2*n+r,n)/(2*n+r))','Lagrange反転による係数 r/(2n+r)*binom(2n+r,n)。modで分母が0になる式は、このままでは使えません。'),check('F-G'),
  ],{primary:1}),
  sample('central-binomial','中央二項係数と平方根','combinatorics','入門 OGF。binom(2n,n)と(1-4X)^(-1/2)。',[
    row('F=fps(n=>nCk(2*n,n))','長さ2nの列でn個の位置を選ぶ個数です。先頭は1,2,6,20,70,252。'),
    row('G=1/sqrt(1-4X)','二項展開で得られる母関数です。有理数係数または必要な根・分母を持つ体で計算します。'),check('F-G'),
  ]),
  sample('shifted-binomial','中央からずれた二項係数とballot数','combinatorics','中級 OGF。固定offsetのbinom(2n,n+offset)。反射原理によるCatalan数との関係。',[
    row('offset=2','中央からのずれr>=0。n<rでは二項係数は0です。'),row('F=fps(n=>nCk(2*n,n+offset))','固定したずれの列を生成します。二つの添字を動かす多変数母関数ではありません。'),
    row('B=fps(n=>nCk(2*n,n))','中央の列。'),row('D=fps(n=>nCk(2*n,n+1))','一つずれた列。'),check('B-D-Catalan','中央列から一つずれた列を引くとCatalan数になります。Dyck路の反射原理に対応します。'),
  ],{primary:1}),
  sample('alternating-permutations','交代順列：sec(X)+tan(X)','combinatorics','入門 EGF。Euler zigzag数。最初の不等号の向きを固定します。',[
    row('A=sec(X)+tan(X)','π_1<π_2>π_3<…となる交代順列の個数。n=0,1は各1個。両向きを合わせるとn>=2では2倍です。参考: https://oeis.org/A000111'),
    row('Even=sec(X)','偶数長の交代順列を担当するEGFです。'),row('Odd=tan(X)','奇数長の交代順列を担当するEGFです。'),check('A-Even-Odd'),
  ],{basis:'egf'}),
  sample('motzkin','Motzkin数と水平ステップ','combinatorics','中級 OGF。非負の格子路。非線形再帰と平方根の解。',[
    row('M=1+X*M+X^2*M^2','空の路・最初の水平ステップ・上昇下降の組で分けます。M_0=1。先頭は1,1,2,4,9,21。'),
    row('G=(1-X-sqrt(1-2X-3X^2))/(2X^2)','定数項1の枝の閉形式。X^2での除算に必要な追加精度も自動的に計算します。'),check('M-G'),
  ]),
  sample('delannoy','Delannoy数：中央列と長方形','combinatorics','中級 OGF。(1,0),(0,1),(1,1)で進む格子路。固定する添字を変える例。',[
    row('height=3','長方形の高さm。0以上の小さな整数に変更してください。'),
    row('D=1/sqrt(1-6X+X^2)','中央Delannoy数D(n,n)。先頭は1,3,13,63,321,1683。'),
    row('E=fps(n=>sum(0,n,k=>nCk(n,k)^2*2^k))','中央列を有限二項和から生成します。'),check('D-E'),
    row('Rectangle=fps(n=>sum(0,n,k=>nCk(height,k)*nCk(n,k)*2^k))','係数nはD(height,n)。中央列とは別の、片方の添字を固定した列です。'),
  ],{primary:1}),
  sample('narayana','Narayana数：行・列とCatalanの細分化','combinatorics','中級 OGF。Dyck路の峰。固定行の多項式と固定列を生成します。',[
    row('size=5','行の番号n。0〜10程度で変更してください。行多項式ではXの次数が峰の数kです。'),row('peaks=2','列で固定する峰の数k。0以上の小さな整数。'),
    row('Row=fps(k=>size==0?(k==0?1:0):(k<1?0:nCk(size,k)*nCk(size,k-1)/size),0,size)','N(n,k)=binom(n,k)binom(n,k-1)/n（n>=1）。長さ2nのDyck路で峰がk個のものを数えます。N(0,0)=1。出典: https://oeis.org/A001263'),
    row('Column=fps(n=>n==0?(peaks==0?1:0):nCk(n,peaks)*nCk(n,peaks-1)/n)','固定kの列N(n,k)。n=0の分岐で0除算を避けます。'),
    check('sum(0,size,k=>Row[k])-Catalan[size]','行の係数和はCatalan数C_sizeです。この行はXの次数がk、Columnはnであることに注意してください。'),
  ],{primary:2}),
  sample('schroder','大小Schröder数（Schroder / Schroeder）','combinatorics','中級 OGF。大小と添字の違い。横断的な格子路の数え上げ。',[
    row('Large=1+X*Large+X*Large^2','大Schröder数。n=0から1,2,6,22,90,…。出典: https://oeis.org/A006318'),
    row('Small=(Large+1)/2','小Schröder数。n=0から1,1,3,11,45,…。n>=1では大の半分。mod2でこの除算は使えません。出典: https://oeis.org/A001003'),
  ]),
  sample('stirling-columns','Stirling数：ブロック数とサイクル数','combinatorics','中級 EGF。第2種と符号なし第1種の固定列。expとlogの構成。',[
    row('k=3','固定するブロック数/サイクル数。0以上の小さい整数。'),
    row('S=(exp(X)-1)^k/k!','第2種S(n,k)。k個の空でないラベル付き集合を、順序を区別せず分けます。'),
    row('P=(-log(1-X))^k/k!','符号なし第1種s(n,k)。置換のサイクル分解のサイクル数がkであるもの。'),
    check('S-egf(n=>stirling2(n,k))'),check('P-egf(n=>stirling1(n,k))'),
  ],{basis:'egf',primary:1}),
  sample('involutions','対合：固定点と2サイクル','combinatorics','入門 EGF。逆置換と等しい置換。部分マッチングとも対応。',[
    row('I=exp(X+X^2/2)','ラベル付きの固定点（X）と無向の対（X^2/2）の集合です。空の対合は1個。'),
    row('J=egf(recurrence(2,seq(1,1),(a,n)=>a[n-1]+(n-1)*a[n-2]))','n番目の要素を固定点にするか、他のn-1要素と対にするかで分ける整数漸化式です。'),check('I-J'),
  ],{basis:'egf'}),
  sample('perfect-matchings','完全マッチング：偶数個の要素を対にする','combinatorics','入門 EGF。ラベル付きの無向ペアの集合。奇数項は0。',[
    row('M=exp(X^2/2)','n頂点の完全マッチング数。n=0は空のマッチング1個、奇数nは0。偶数2mでは(2m)!/(2^m*m!)です。'),
    row('N=egf(n=>n%2==1?0:n!/(2^(n/2)*(n/2)!))','偶奇で分岐し、必要な枝だけを評価します。'),check('M-N'),
  ],{basis:'egf'}),
  sample('ordered-bell','順序付きBell数（Fubini数）','combinatorics','中級 EGF。集合分割のブロックに順序を付ける例。',[
    row('F=1/(2-exp(X))','空でないラベル付き集合の列：1/(1-(exp(X)-1))。空列は1個。'),
    row('G=egf(n=>sum(0,n,k=>k!*stirling2(n,k)))','kブロックの分割にk!通りの順序を付けて和を取ります。'),check('F-G'),
  ],{basis:'egf'}),
  sample('restricted-set-partitions','サイズ制限付き集合分割','combinatorics','中級 EGF。ブロックサイズの上限をパラメータで変え、Bell数と比べます。',[
    row('limit=3','1ブロックに含められる要素数の上限。正の小さな整数。limit=2では対合になります。'),
    row('P=sum(1,limit,k=>X^k/k!)','許される空でないラベル付きブロックのEGFです。'),row('F=exp(P)','そのようなブロックの集合を作ります。空集合の分割は1個。'),
    row('Bell=exp(exp(X)-1)','制限なしのBell数のEGF。Fとは条件が異なるため、高次では一致しません。'),
  ],{basis:'egf',primary:2}),
  sample('restricted-partitions','異なる部分・奇数部分・最大部分の整数分割','combinatorics','中級 OGF。無限積の条件変更。Eulerの「異なる部分＝奇数部分」を比較。',[
    row('limit=3','最大部分の上限。正の小さい整数。'),row('Distinct=prod(1,k=>1+X^k)','各サイズを高々1回使う、異なる部分への分割です。'),
    row('Odd=prod(1,k=>1/(1-X^(2*k-1)))','各奇数サイズを何回でも使える分割です。'),check('Distinct-Odd','異なる部分への分割と奇数部分への分割は同じ個数になります。'),
    row('Bounded=prod(1,limit,k=>1/(1-X^k))','最大部分がlimit以下の分割。上端を指定した有限積です。'),
  ],{primary:1}),
];
