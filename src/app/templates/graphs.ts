import { sample, row, check, graphSource } from './catalog.ts';
import type { NotebookTemplate } from './catalog.ts';

type Rows=Parameters<typeof sample>[4];
const graph=(id:string,title:string,description:string,rows:Rows,primary=0):NotebookTemplate=>sample(id,title,'graphs',description,rows,{terms:8,basis:'egf',primary});

export const graphTemplates = [
  graph('undirected-graphs','全無向グラフと連結グラフ','入門 EGF。ラベル付き単純グラフ。exp/logで連結成分を分解。',[
    row('A=egf(n=>2^(nCk(n,2)))',`各頂点対の辺の有無を独立に選ぶので個数は2^binom(n,2)。空グラフは1個。${graphSource}`),
    row('L=log(A)','全グラフは非空の連結グラフの集合なのでA=exp(L)。連結グラフのn=0は0、単点は1個です。'),check('exp(L)-A'),
  ]),
  graph('unicyclic-graphs','なもり：単一サイクルの連結グラフ','中級 EGF。ラベル付き、頂点数＝辺数。サイクル長は3以上。',[
    row('T=X*exp(T)',`サイクルの各頂点に付くラベル付き根付き木。${graphSource}`),
    row('U=(-log(1-T)-T-T^2/2)/2','サイクル長k>=3についてT^k/(2k)を足します。長さ1/2を除き、回転と向きの重複を除きます。log項の前は負号です。'),
    check('U-sum(3,k=>T^k/(2*k))','形式的に収束する無限和の定義と比較します。n=0,1,2は0で、n=3は三角形1個。'),
  ],1),
  graph('eulerian-graphs','連結オイラーグラフ：全頂点が偶次数','中級 EGF。連結性を外して数え、logで取り出します。',[
    row('A=egf(n=>n==0?1:2^(nCk(n-1,2)))',`全頂点が偶次数のラベル付き単純グラフ。n>=1で2^binom(n-1,2)。空グラフは1個とし、n=0では負の二項係数引数を評価しません。${graphSource}`),
    row('F=log(A)','連結で全頂点が偶次数のグラフ。単点を含み、n=0は0。先頭は0,1,0,1,3,38,720,…。'),
  ],1),
  graph('bipartite-graphs','二部グラフと2彩色の区別','中級 EGF。色付きから連結・色なし・全二部グラフへ。',[
    row('A=egf(n=>sum(0,n,k=>nCk(n,k)*2^(k*(n-k))))',`k点を色0、残りを色1とすると、色の異なる頂点間だけ辺を選べます。ここでは彩色の方法も区別します。${graphSource}`),
    row('L=log(A)/2','非空の連結二部グラフの2彩色はちょうど2通りなので、連結化してから2で割ります。孤立点もこの規則に含まれます。'),
    row('B=exp(L)','ラベル付き二部グラフの個数。連結成分ごとの彩色の重複を除いています。全体を単に2で割るのは誤りです。'),check('B-sqrt(A)'),
  ],2),
  graph('bridgeless-graphs','橋なし連結グラフ（単点を含む）','発展 EGF。2-辺連結成分の分解。合成逆関数・根付けと積分。',[
    row('A=egf(n=>2^(nCk(n,2)))',graphSource),row('L=log(A)','連結グラフのEGF。'),row('D=X*diff(L)','根付き連結グラフ。n頂点の対象の根の選択肢nを掛けます。'),
    row('E=X*exp(D)','根に接続する辺がすべて橋である根付き連結グラフのEGF。根を除くとDの集合です。'),
    row('Q=D(revert(E))','D=Q(E)を合成逆関数で解きます。Qは根付きの橋なし連結グラフです。'),
    row('H=integral(Q/X)','根を外すためnで割る操作です。空グラフは数えず、単点は橋を持たない連結グラフとして1個。先頭は0,1,0,1,10,253,…。'),
  ],5),
  graph('biconnected-blocks','二重連結ブロック（K2を含む）','発展 EGF。関節点による分解と、微分・log・revert・積分。',[
    row('A=egf(n=>2^(nCk(n,2)))',graphSource),row('L=log(A)','非空の連結グラフのEGF。'),row('D=X*diff(L)','根付き連結グラフ。D(0)=0で一次係数は1です。'),
    row('J=log(diff(L))','頂点を一つ特別視した連結グラフを、関節点で分解します。diff(L)の定数項は1です。'),
    row('Q=J(revert(D))','根付き連結グラフの合成を外して、ブロックの微分のEGFを得ます。'),
    row('H=integral(Q)','空グラフ・単点を含まず、K2を1個のブロックとします。先頭は0,0,1,1,10,238,…。3頂点以上を要求する狭義の2-頂点連結と区別してください。'),
  ],5),
  graph('directed-graphs','ラベル付き有向グラフ：反対向きの辺','入門 EGF。ループなし。2点間で反対向きの2辺を同時に許します。',[
    row('A=egf(n=>2^(n*(n-1)))',`順序付きの異なる頂点対n(n-1)個で、辺の有無を独立に選びます。空グラフは1個です。${graphSource}`),
    check('A-egf(n=>4^(nCk(n,2)))','各無向頂点対では「なし・片方向2種・両方向」の4通りです。'),
  ]),
  graph('dag','ラベル付きDAGと包除・重み付き逆元','発展 EGF。入次数0の頂点による包除。係数の2冪の正規化が必要です。',[
    row('W=egf(n=>(-1)^n/2^(nCk(n,2)))',`sourceとして指定した頂点集合について包除し、2^binom(n,2)で係数を正規化した重みです。${graphSource}`),
    row('F=map(inv(W),(a,n)=>a*2^(nCk(n,2)))','正規化した級数を逆元にし、各係数の2冪を戻します。結果はDAG数のEGF。n=0は1です。'),
    row('G=egf(recurrence(1,seq(1),(a,n)=>sum(1,n,k=>(-1)^(k-1)*nCk(n,k)*2^(k*(n-k))*a[n-k])))','source集合の包除を直接の整数漸化式として計算し、EGFに変換します。'),check('F-G'),
  ],1),
  graph('strong-digraphs','強連結有向グラフとsource成分の包除','発展 EGF。通常の有向グラフ数を2冪で正規化して逆元を取り、logへ進みます。',[
    row('A=egf(n=>2^(nCk(n,2)))',`全有向グラフ数2^(n(n-1))を2^binom(n,2)で割った正規化EGFです。全有向グラフそのもののEGFではありません。${graphSource}`),
    row('D=map(inv(A),(a,n)=>a*2^(nCk(n,2)))','source強連結成分の個数に(-1)^kの重みを付けた有向グラフのEGFへ、正規化を戻します。'),
    row('F=-log(D)','D=exp(-F)から非空の強連結有向グラフを取り出します。単点は1個。先頭は0,1,1,18,1606,…。'),
  ],2),
  graph('tournaments','トーナメントと強連結トーナメント','中級 EGF。各頂点対にちょうど片向きの辺。成分が全順序を持ちます。',[
    row('A=egf(n=>2^(nCk(n,2)))',`各頂点対で辺の向きを2通りから選びます。全トーナメントは空のものを1個含みます。${graphSource}`),
    row('F=1-1/A','強連結成分の順序が一意なのでA=1+F+F^2+…=1/(1-F)。非空の強連結トーナメントのEGFを得ます。'),
    check('A*(1-F)-1'),
  ],1),
];
