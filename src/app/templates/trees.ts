import { sample, row, check, graphSource } from './catalog.ts';

export const treeTemplates = [
  sample('plane-trees','平面根付き木：子の順序を区別する','trees','中級 OGF。頂点数で数えた平面木とCatalan数の添字ずれ。',[
    row('P=X/(1-P)','根に、0個以上の子の部分木を順序付きで並べます。係数nはn頂点の非空の平面根付き木。空の木は0個です。'),
    row('Q=X*Catalan','頂点数n>=1ではCatalan数C_(n-1)。子の順序を区別しない木とは数え方が違います。'),check('P-Q'),
  ],{terms:10}),
  sample('labeled-trees','ラベル付き根付き木・自由木とLambertW','trees','中級 EGF。Cayleyの公式、再帰、LambertW、revertを比較します。',[
    row('T=X*exp(T)',`根を取り除くとラベル付き根付き木の集合になるためT=X*exp(T)。n>=1で個数はn^(n-1)。n=0は0。${graphSource}`),
    row('U=T-T^2/2','ラベル付き自由木（根なし）のEGF。n=0は0、単点は1個。n>=2の個数はn^(n-2)です。'),
    check('T+LambertW(-X)','T=-LambertW(-X)となる原点の枝と比較します。'),check('T-revert(X*exp(-X))','T*exp(-T)=Xなので合成逆関数としても求められます。'),
    check('T-egf(n=>n==0?0:n^(n-1))'),check('U-egf(n=>n==0?0:n==1?1:n^(n-2))'),
  ],{terms:8,basis:'egf'}),
  sample('labeled-forests','ラベル付き森：各成分に根を付けるか','trees','中級 EGF。自由木の集合と根付き木の集合を比較。空の森は1個です。',[
    row('T=X*exp(T)',`ラベル付き根付き木。${graphSource}`),row('U=T-T^2/2','根を指定しないラベル付き木です。'),
    row('F=exp(U)','ラベル付きの森。各連結成分は自由木であり、根を選びません。先頭は1,1,2,7,38,291。'),
    row('G=exp(T)','各成分で根を1点ずつ指定した森。Fとは別の数え上げです。'),check('G-egf(n=>n==0?1:(n+1)^(n-1))','根付き森の個数はn>=1で(n+1)^(n-1)。空の森を1個とします。'),
  ],{terms:8,basis:'egf',primary:2}),
  sample('unlabeled-trees','ラベルなし根付き木・自由木','trees','中級 OGF。同型な木を同一視する数え上げ。Euler変換とdissymmetry。',[
    row('R=X*eulerTransform(R)',`子は根付き木の多重集合。子の順序を区別せず、頂点ラベルも付けません。r_0=0。${graphSource}`),
    row('U=R-(R^2-R(X^2))/2','非空の自由木（根なし）。頂点根付き＋辺根付き−向き付き辺根付きで根を外します。符号に注意。先頭は0,1,1,1,2,3,6,11。'),
    row('R(X^2)','同じ二つの部分木を交換しても同型になる補正項です。参考: https://oeis.org/A000055 （このノートでは空の木を数えず、定数項は0）。'),
  ],{terms:8}),
  sample('unlabeled-forests','ラベルなし森と根付き森：多重集合','trees','中級 OGF。expではなくEuler変換。同型と成分の根の指定を区別します。',[
    row('R=X*eulerTransform(R)','ラベルなし根付き木のOGFです。'),row('U=R-(R^2-R(X^2))/2','ラベルなし自由木のOGF。空の木は含めません。'),
    row('F=eulerTransform(U)','ラベルなし自由木の多重集合が、ラベルなしの森です。空の森は1個です。'),
    row('G=eulerTransform(R)','各成分に根を指定したラベルなし森です。ラベル付きの集合に使うexpとは違います。'),check('G-R/X','森に新たな根を1点加える対応からG=R/X。Xで割る分の追加精度も伝播します。'),
  ],{terms:8,primary:2}),
  sample('functional-graphs','写像グラフ：サイクルに根付き木を付ける','trees','発展 EGF。各点から1本の出辺。自己ループを許す写像のグラフを数えます。',[
    row('T=X*exp(T)','ラベル付き根付き木を各サイクル頂点に付けます。ここで数える写像グラフは自己ループを許し、単純有向グラフのサンプルとは規約が違います。'),
    row('Connected=-log(1-T)','連結成分のサイクルの長さは1以上。ラベル付き有向サイクルの構成です。'),row('F=exp(Connected)','連結成分の集合を作ると任意の写像になります。空集合から自身への写像は1個です。'),
    check('F-1/(1-T)'),check('F-egf(n=>n==0?1:n^n)','n点からn点への写像の個数n^nと比較します。'),
  ],{terms:8,basis:'egf',primary:2}),
];
