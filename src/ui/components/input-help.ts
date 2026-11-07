/** 静的な構文ガイド。ノートの状態やイベントを所有しない。 */
export const inputHelpMarkup = `
      <details class="syntax-help"><summary>数列・漸化式・微積分系</summary><div>
        <dl><dt>sum(1,10,k =&gt; k^2) / prod(1,10,k =&gt; 1+X^k)</dt><dd>両端を含む有限の総和 / 総積。スカラーとFPSに対応</dd>
        <dt>sum(1,k =&gt; X^k) / prod(1,k =&gt; 1/(1-X^k))</dt><dd>上端を省略すると無限和 / 無限積。各項 / 各因子と1の差の次数が増大すると証明できる形に対応</dd>
        <dt>fps(n =&gt; 1/n,1,10)</dt><dd>次数1〜10の係数だけを生成。範囲外は0でラムダを実行しません。上端は省略可能</dd>
        <dt>egf(n =&gt; 1) / egf(n =&gt; a_n,lo,hi)</dt><dd>重みa_nから a_n X^n/n! を生成。egf(n=&gt;1)はexp(X)。表示基底とは独立し、範囲外は0</dd>
        <dt>eulerTransform(f)</dt><dd>f(0)=0から ∏(1-X^n)^(-[X^n]f) を生成。有理数または必要な整数を割れる素数modに対応</dd>
        <dt>f=1+diff(X*X*f) / t=X*eulerTransform(t)</dt><dd>微分・合成・総和・map・ラムダ生成を含む、下の次数から決まる循環も係数順に計算</dd>
        <dt>f=X+X*revert(f)</dt><dd>合成逆関数を含む循環も、定数項0・一次係数非零で次数順に決まる場合に計算</dd>
        <dt>sin / cos / tan / sec / csc / cot</dt><dd>三角関数。sin(X)等で呼び出し、csc(X)やcot(X)はLaurent級数</dd>
        <dt>sinh / cosh / tanh / sech / csch / coth</dt><dd>双曲線関数。通常の引数は定数項0。各逆関数はarc付き・a付きの名前に対応</dd>
        <dt>arcsin(X) / arctan(X) / arccos(1-X^2/2)</dt><dd>逆関数の原点の枝。arccosは定数項1で平方根が係数体内に存在する入力に対応。π/2等の超越定数は未対応</dd>
        <dt>seq(a0,a1,…)</dt><dd>通常係数を列挙してFPSを入力。後続係数は0</dd>
        <dt>linrec(2,seq(1,1),seq(0,1))</dt><dd>定係数線形漸化式からFPSを生成。第1引数は次数、係数は直前の項から順番</dd>
        <dt>recurrence(2,seq(0,1),(a,n) =&gt; a[n-1]+a[n-2])</dt><dd>過去の項だけを使う一般漸化式。nは生成する項の添字</dd>
        <dt>rationalGF(2,seq(1,1),seq(0,1))</dt><dd>同じ線形漸化式から有理母関数を厳密に復元</dd>
        <dt>guess(seq(0,1,1,2,3,5,8,13),4,3)</dt><dd>最初の4項から最大3次の漸化式を推測し、残りの項で検証。恒等性の証明ではありません</dd>
        <dt>pRecursive(seq(1),-1,1+x) / pRecGF(seq(1),-1,1+x)</dt><dd>Σ p_j(n) a_(n+j)=0 から係数 / 微分方程式を生成。多項式中のxはnを表します</dd>
        <dt>partialSums(f) / binomialTransform(f) / inverseBinomialTransform(f)</dt><dd>部分和 / 二項変換 / 逆二項変換</dd>
        <dt>hadamard(f,g) / even(f) / odd(f) / extract(f,m,r)</dt><dd>係数ごとの積 / 偶数項 / 奇数項 / a_(mn+r) の抽出</dd>
        <dt>compare(f,g)</dt><dd>通常係数で指定精度まで比較し、最初に異なる次数を表示</dd>
        <dt>f=1+integral(f)</dt><dd>積分による再帰定義。積分定数は0</dd>
        <dt>diff(u)=u / diff(diff(u))=-u</dt><dd>連立欄で微分方程式を指定。未知数欄に u=1 / u=seq(0,1) のように初期係数を入力</dd></dl>
      </div></details>
      <details class="syntax-help"><summary>入力のヒント</summary><div>
        <p><code>f = 1/(1-x)</code> と定義し、別の行から <code>f</code> を参照できます。乗算は <code>*</code>（<code>2X</code>・<code>2F</code> のように省略可）、べき乗は <code>^</code> です。<code>FG</code> は1つの名前です。</p>
        <dl><dt>sqrt(f) / f^(1/3) / f^g</dt><dd>厳密な平方根、有理数乗、定数項1のFPS乗</dd><dt>n! / nCk(n,k) / nPk(n,k) / nHk(n,k)</dt><dd>階乗・二項係数・順列・重複組合せ。C・P・Hは変数名に使用可能</dd><dt>stirling1(n,k) / stirling2(n,k)</dt><dd>第1種（符号なし）/ 第2種スターリング数</dd><dt>f[k] / coeff(f,k)</dt><dd>通常係数 [x^k]f をスカラーとして抽出</dd><dt>fps(n =&gt; 1/n!)</dt><dd>次数から係数を計算してFPSを生成</dd><dt>map(f,(a,i) =&gt; (i+1)!*a^2)</dt><dd>係数と添字にラムダ式を適用。a[i+1] で隣接係数も参照可能</dd><dt>fps(n =&gt; n%2==0 ? 1 : 0)</dt><dd>次数で条件分岐。if(条件,真,偽) も使用可能</dd><dt>Catalan / Catalan(f)</dt><dd>カタラン数の母関数 / 定数項0のFPSとの合成</dd><dt>LambertW(f)</dt><dd>W exp(W)=f、W(0)=0となる形式級数。f(0)=0が必要</dd><dt>exp(f) / log(f)</dt><dd>定数項はそれぞれ 0 / 1</dd><dt>inv(f) / revert(f)</dt><dd>乗法逆元 / 合成逆関数</dd><dt>compose(f,g) / diff(f) / integral(f)</dt><dd>合成 / 微分 / 定数項0の積分</dd></dl>
        <p><code>1/x</code>、<code>inv(x-x^2)</code>、<code>x^-2</code> はLaurent級数として計算できます。<code>f[-1]</code> で負の次数の係数も抽出できます。Laurent級数はO.G.F.表示に対応します。</p>
        <p>⧉ で式を直後に複製できます。定義式は名前もコピーするため、複製後に別名へ変更してください。</p><p>通常行に f = 1+x*f^2 と入力して再帰定義を解けます。「再帰の初期値」で枝を指定できます。一般の連立系は上の専用欄を使ってください。有限体で exp・log・積分などを使う場合、必要な整数の逆元が存在する必要があります。</p>
        <p>各行の「コメント」に説明やメモを入力できます（2000文字まで）。コメントは計算せず、保存・JSON・共有URL・複製・undo/redoの対象になります。</p>
      </div></details>
`;
