## 개요

이 문서는 Clef 컴파일러를 TypeScript로 짓기 위한 구현 설계도이다. 스펙(음악 프로그래밍 언어 컴파일러 설계서)이 언어와 각 단계의 입출력을 정한다면, 이 문서는 그것을 어떤 프로젝트 설정, 폴더, 클래스, 함수로 구현하는지를 정한다. 두 문서가 어긋나면 스펙이 우선이다.

문서 안의 코드는 임시 프로젝트에서 직접 타입 검사를 통과시키고, 스펙의 입출력 예시로 실행해 확인한 것이다. 확인한 범위는 다음과 같다.

| 확인한 것                    | 방법                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| 모든 파일의 타입 검사        | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 상태에서 `tsc` 통과          |
| 토큰 출력                    | 스펙 렉서 예시 5개와 오류 3개(E001 ~ E003)                                                      |
| 오류와 경고의 줄:열과 메시지 | 스펙 테스트 명세의 E101 ~ E403, W601 ~ W603 전부                                                |
| 평가에서 틱 변환까지의 출력  | 프로그램 P, 묶음, 병렬, 쉼표, 반복, 두 트랙, 함수, 반음 이조, 장조와 단조의 온음계 이조, 붙임줄 |
| 최적화 전후 동일성           | 정상 프로그램 10개와 E307 프로그램 4개에서 `-O0`과 기본 옵션의 LIR과 진단이 같음                |
| MIDI 파일                    | `mido`로 읽어 형식, 분해능, 템포, 박자표, 음 이벤트 확인                                        |
| 파헬벨 카논 예제             | 4트랙으로 컴파일되고 약 43.6초 길이의 `.mid`가 나옴                                             |

문서에 싣지 않은 코드(렉서와 파서의 문장 처리, 검사기의 세부 등)도 같은 임시 프로젝트에 구현되어 위 확인에 쓰였다. 이 문서는 구조와 핵심 알고리즘을 코드로 싣고, 나머지는 시그니처와 규칙으로 적는다. 직접 구현한 결과를 비교하고 싶으면 참조 구현을 따로 줄 수 있다.

이 문서는 구현 순서대로도 읽을 수 있다. 구현 순서 절의 표가 코딩 순서이고, 단계마다 설계는 모듈별 구현의 해당 절에 있다. 렉서는 정규식에서 Thompson 구성과 부분집합 구성으로 DFA를 만들고, 파서는 문법에서 LALR(1) 표를 만들어 LR 구동기로 돌린다. 위 확인 표의 토큰 출력과 파서 항목은 이 방식으로 바꾸기 전의 구현으로 얻은 값이므로 새 구현에서 다시 확인한다.

구성은 다음과 같다.

- 구현 순서(코딩 순서와 수업 내용과의 대응)
- 프로젝트 설정과 폴더 구조
- 객체 지향 설계와 모듈 의존 방향
- 모듈별 구현(자료구조, 알고리즘, 주의점)
- 진단 위치 규칙과 테스트 설계
- CLI와 시연
- 스펙에 없어서 이 문서가 정한 가정과, 확인하지 못한 항목

## 구현 순서

이 문서는 아래 순서대로 코딩하는 것을 전제로 한다. 각 단계의 설계는 모듈별 구현의 해당 절에 있다. 단계 1 ~ 5는 렉서 절, 문법과 단계 6 ~ 10은 파서 절, 단계 11은 AST 절, 단계 12는 검사기 절, 단계 13은 붙임줄 처리 절, 단계 15는 최적화 절, 단계 14는 낮은 수준 IR 변환 절, 단계 16은 파이프라인 절, 단계 17은 표준 MIDI 파일 기록 절 뒤에 있다. 결정 1 ~ 6은 스펙과 대조할 가정 표의 해당 행이다.

한 단계가 끝나면 그 단계의 테스트를 통과시키고 커밋한 뒤 다음으로 간다. 단계 5, 9, 13, 16이 외부에서 확인할 수 있는 이정표이다.

| 단계 | 만드는 것                                    | 파일                                                                                 | 규모  |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------ | ----- |
| 1    | 문자 집합과 정규식 AST                       | `automata/charset.ts`, `automata/regex.ts`                                           | 140줄 |
| 2    | NFA와 Thompson 구성                          | `automata/nfa.ts`, `automata/thompson.ts`                                            | 120줄 |
| 3    | DFA와 부분집합 구성                          | `automata/dfa.ts`, `automata/subset.ts`                                              | 110줄 |
| 4    | Clef 토큰 규칙과 최대 일치 스캐너            | `lexer/rules.ts`, `lexer/scanner.ts`                                                 | 220줄 |
| 5    | 토큰 후처리, 오류 보고, 렉서 완성 (이정표 1) | `lexer/lexer.ts`                                                                     | 90줄  |
| 6    | 문법 자료구조와 FIRST                        | `grammar/grammar.ts`, `grammar/first.ts`                                             | 110줄 |
| 7    | LR(1) 항목, LALR 표, 충돌 보고               | `grammar/lr1.ts`, `grammar/lalr.ts`, `grammar/table.ts`                              | 200줄 |
| 8    | LR 구동기와 파스 트리                        | `grammar/lr-driver.ts`                                                               | 100줄 |
| 9    | Clef 문법 연결, `--emit parse` (이정표 2)    | `parser/clef-grammar.ts`, `parser/terminals.ts`, `parser/parser.ts`, `emit/parse.ts` | 180줄 |
| 10   | 오류 복구와 E010, E011, E002                 | `grammar/lr-driver.ts`, `parser/errors.ts`                                           | 110줄 |
| 11   | SDT로 AST 생성                               | `parser/actions.ts`, `ast/ast.ts`, `common/rational.ts`                              | 250줄 |
| 12   | 검사기와 심볼 테이블                         | `check/checker.ts`                                                                   | 300줄 |
| 13   | 평가기와 HIR (이정표 3)                      | `eval/*`                                                                             | 450줄 |
| 14   | LIR 변환                                     | `lower/lowerer.ts`                                                                   | 90줄  |
| 15   | 최적화                                       | `opt/*`                                                                              | 250줄 |
| 16   | 파이프라인, CLI, `--emit` (이정표 4)         | `pipeline.ts`, `cli/main.ts`                                                         | 150줄 |
| 17   | SMF 출력, 웹 시연                            | `smf/writer.ts`, `web/*`                                                             | 선택  |

단계 17만 선택이다. 나머지는 모두 파이프라인에 필요하다.

### 수업 내용과의 대응

수업에서 배운 것 중 파이프라인에 필요한 것만 구현한다.

| 수업 주제                                         | 구현하는 단계 | 쓰는 곳                                                         |
| ------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| 정규식, 유한 오토마타                             | 1 ~ 4         | 토큰 규칙이 정규식이라는 점, 한계(괄호 깊이는 정규 언어가 아님) |
| Thompson 구성                                     | 2             | 토큰 규칙을 NFA로                                               |
| 부분집합 구성, ε 폐포                             | 3             | NFA를 DFA로                                                     |
| CFG, 모호성                                       | 6             | Clef 문법의 BNF                                                 |
| FIRST                                             | 6             | LR(1) 항목의 lookahead                                          |
| LR(1) 항목, CLOSURE, GOTO, LALR 표와 충돌         | 7             | Clef의 LALR 표                                                  |
| shift, reduce 구동 알고리즘                       | 8             | 파스 트리 출력                                                  |
| 파서의 오류 처리(패닉 모드, 오류 생산)            | 10            | 여러 줄의 오류를 한 번에 보고                                   |
| SDT, 속성(synthesized, inherited), S-속성, L-속성 | 11, 12, 13    | AST 생성 동작, 타입 속성, 시작 시각 속성                        |
| 심볼 테이블                                       | 12            | `--emit typed`                                                  |
| IR, 3주소 코드                                    | 14            | `--emit ir`과 3주소 코드의 대응                                 |
| 기본 블록, 지역 최적화, DAG 공통 부분식 제거      | 15            | `--emit ast-opt`, `--emit hir-opt`                              |

### 현재 상태

- 완료: `common/span.ts`, `diagnostics/diagnostic.ts`, `lexer/token.ts`(토큰 클래스와 `format()`)
- 일부: `music/pitch.ts`는 `Letter`, `Accidental`, `Mode` 타입만 있다.
- 비어 있음: `lexer/lexer.ts`, 그 밖의 모든 모듈

`token.ts`는 그대로 쓴다. 이 문서의 렉서는 `Token` 클래스를 만드는 방법만 바꾸고 토큰 자체는 바꾸지 않는다. `PunctKind`에 `CALL_LP`를 추가하지 않는다. 호출과 나열의 구분은 `LPAREN`과 `spaceBefore`로 충분하다(결정 2). `KEYWORDS` 맵은 단계 4에서 키워드 규칙을 만드는 데 그대로 쓴다.

## 프로젝트 설정

### 도구 구성

개발 도구는 Vite+(명령어 `vp`) 하나로 통일한다. Vite+는 Vite, Vitest, Oxlint, Oxfmt, Rolldown을 한 CLI로 묶은 도구이고 설정을 `vite.config.ts` 한 파일에 둔다. 알파 단계이므로 명령과 설정 키는 `vp help`로 다시 확인한다.

| 용도                          | 도구                     | 호출                 |
| ----------------------------- | ------------------------ | -------------------- |
| 개발 서버(시연 앱)            | Vite                     | `vp dev`             |
| 빌드                          | Rolldown                 | `vp build`           |
| 테스트                        | Vitest                   | `vp test`            |
| 린트                          | Oxlint                   | `vp lint`            |
| 포맷                          | Oxfmt                    | `vp fmt`             |
| 린트, 포맷, 타입 검사 한 번에 | Oxlint, Oxfmt, 타입 검사 | `vp check`           |
| CLI 실행(개발 중)             | vpx                      | `vp run clef <파일>` |

Vitest, Oxlint, Oxfmt는 Vite+가 감싸므로 직접 설치하지 않고 `vp test`, `vp lint`, `vp fmt`로만 호출한다. Node.js는 20.19 이상 또는 22.12 이상이 필요하다.

CLI는 `vpx`로 실행한다. `package.json`의 `clef` 스크립트가 `vpx src/cli/main.ts`이므로 `vp run clef examples/canon.clef`처럼 쓴다. `vpx`는 Vite+에 들어 있는 oxc-node 로더로 TypeScript를 바로 실행하므로 `tsx`를 따로 설치하지 않는다. 코드가 생성자 매개변수 속성(`constructor(private readonly x)`)을 쓰는데, Node의 타입 제거 실행은 이 문법을 처리하지 못하지만 `vpx`는 처리한다. 같은 이유로 `vp create`가 켜 둔 `erasableSyntaxOnly`는 끈다.

### 명령

프로젝트는 `vite:application` 템플릿으로 만든다. 브라우저 시연 앱(`index.html`)이 있고 CLI도 같은 패키지에 두므로 이 템플릿이 맞다. `vite:monorepo`는 패키지를 여러 개로 나눌 때, `vite:library`는 npm 배포용이라 쓰지 않는다. 템플릿 이름은 `vp create --list`로 확인한다.

```bash
cd clef                                    # 클론해 둔 폴더 (.git이 이미 있음)
vp create vite:application --directory . --package-manager pnpm
vp install
vp add -D fast-check @types/node   # fast-check는 속성 테스트용
vp run clef examples/canon.clef    # CLI (vpx src/cli/main.ts)
vp dev               # 브라우저 시연 앱
vp test              # 단위, 골든, 속성 테스트
vp check             # 린트 + 포맷 + 타입 검사. 커밋 전에 통과시킨다
```

폴더에 `.git`이 있으면 비어 있지 않은 폴더로 취급되어 템플릿에 따라 중단될 수 있다. `--force`는 `vp create` 문서에 적혀 있지 않으므로 기대하지 않는다. 중단되면 임시 폴더에 `--no-git`으로 만든 뒤 파일을 옮긴다.

```bash
cd ..
vp create vite:application --directory clef-tmp --no-git --package-manager pnpm
mv clef-tmp/* clef-tmp/.[!.]* clef/ && rmdir clef-tmp
cd clef && vp install
```

패키지 매니저는 pnpm을 쓴다. `--package-manager`는 `pnpm`, `npm`, `yarn`, `bun` 중에서 고를 수 있지만, 실행 환경이 Node(Vitest, vpx)이므로 설치 환경도 Node 계열로 맞춘다. 팀원 모두 같은 매니저를 쓴다.

### 설정 파일

`vite.config.ts`는 Vite+가 읽는 유일한 설정이다. 테스트 위치, 린트 제외 경로, 포맷 옵션만 둔다.

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  lint: { ignorePatterns: ['dist/**'] },
  fmt: { semi: true, singleQuote: true },
});
```

`tsconfig.json`은 `vp create`가 만든 파일을 바탕으로 아래 항목만 보장하면 된다. 문서의 코드는 이 설정에서 일반 `tsc`로 타입 검사를 통과했다. Vite+ 1.7.0부터 `vp check`의 타입 검사는 TypeScript 7 컴파일러의 Rust 포팅(tsrs) 위에서 돌아가므로, 아래 옵션을 켠 상태에서 `vp check`도 통과하는지 처음에 한 번 확인한다.

| 옵션                         | 값          | 이유                                                                                    |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `strict`                     | true        | 기본 안전망                                                                             |
| `noUncheckedIndexedAccess`   | true        | `tokens[i]`가 `undefined`일 수 있음을 타입에 반영한다. 렉서와 파서의 범위 오류를 막는다 |
| `exactOptionalPropertyTypes` | true        | 선택 필드에 `undefined`를 몰래 넣는 일을 막는다                                         |
| `noImplicitOverride`         | true        | 상속 사용 시 실수 방지                                                                  |
| `verbatimModuleSyntax`       | true        | 타입만 가져올 때 `import type`을 강제한다                                               |
| `allowImportingTsExtensions` | true        | import 경로에 `.ts`를 쓴다                                                              |
| `target`                     | ES2022 이상 | `BigInt` 리터럴(`0n`) 사용                                                              |
| `moduleResolution`           | Bundler     | Vite와 같은 해석 규칙                                                                   |
| `erasableSyntaxOnly`         | false       | 생성자 매개변수 속성을 쓴다. `vpx`와 Vite는 이 문법을 처리한다                          |

### 의존성 정책

배포하지 않는 수업 과제이므로 의존성의 크기는 따지지 않고, 코드를 빨리 짤 수 있는지를 기준으로 고른다. 단, 렉서와 파서는 평가 항목(각 10점)이므로 외부의 파서 생성기나 렉서 생성기를 쓰지 않는다. 대신 정규식에서 DFA를 만드는 코드와 문법에서 LALR 표를 만드는 코드를 직접 만든다(렉서와 파서 절).

아래 라이브러리는 모두 처음부터 설치해 둔다.

| 라이브러리                       | 쓰는 단계 | 쓰는 곳                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ts-pattern`                     | 전체      | 여러 경우로 갈라지는 분기는 `switch` 대신 `match`로 쓴다. 유니온의 모든 멤버를 처리해야 하면 `.exhaustive()`, 나머지를 한꺼번에 처리해도 되면 `.otherwise()`를 쓴다. 검사기의 연산자 규칙(`match([l, r]).with(['Note', 'Interval'], …)`)처럼 두 값의 짝을 보는 분기에도 쓴다. AST, HIR, LIR의 `kind` 분기는 새 멤버가 생기면 컴파일 오류가 나도록 `.exhaustive()`를 쓴다 |
| `es-toolkit`                     | 전체      | `groupBy`(붙임줄 검사의 `byStart`), `uniqBy`(진단 중복 제거), `sortBy`, `sumBy`, `range` 같은 컬렉션 도우미                                                                                                                                                                                                                                                              |
| `picocolors`                     | 9단계     | CLI 진단 출력의 색                                                                                                                                                                                                                                                                                                                                                       |
| `@tonejs/midi`                   | 10단계    | Vitest 안에서 `.mid`를 읽어 검증한다. SMF 기록기를 직접 짜지 않고 이것으로 대신해도 된다(채점 대상이 아니다)                                                                                                                                                                                                                                                             |
| `codemirror`, `@codemirror/lint` | 11단계    | 웹 시연의 입력창. lint 확장으로 진단 위치에 밑줄을 긋는다                                                                                                                                                                                                                                                                                                                |
| `tone`                           | 11단계    | 웹 시연의 재생                                                                                                                                                                                                                                                                                                                                                           |

개발 의존성은 `fast-check`, `@types/node`와 Vite+이다. `tone`과 `codemirror`는 DOM이 필요하므로 `src/web`에서만 쓴다. `src/core`에서 쓰면 CLI가 같은 코드를 쓰지 못한다.

쓰지 않기로 한 것도 적어 둔다. `zod`는 검증할 구조화된 외부 입력이 없어서 쓰지 않는다. 입력은 `.clef` 텍스트뿐이고 그 검증이 곧 파서의 일이다. CLI 인수 파싱 라이브러리는 옵션이 세 개뿐이라 `node:util`의 `parseArgs`로 충분하다.

## 폴더 구조

### 트리

```text
clef/
├─ index.html                     시연 앱 진입점 (Vite 규칙: 프로젝트 루트)
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ examples/
│  ├─ program-p.clef              스펙 전체에서 쓰는 공통 프로그램 P
│  └─ canon.clef                  파헬벨 카논 (시연용)
├─ src/
│  ├─ core/                       컴파일러 본체. DOM과 파일 시스템에 의존하지 않는다
│  │  ├─ common/
│  │  │  ├─ span.ts               Span, SourceFile
│  │  │  └─ rational.ts           Rational (BigInt 분수)
│  │  ├─ diagnostics/
│  │  │  └─ diagnostic.ts         Diagnostic, DiagCode, DiagnosticBag
│  │  ├─ music/
│  │  │  ├─ pitch.ts              MIDI 번호, 음계, diatonicShift
│  │  │  └─ instruments.ts        악기표, 채널 배정
│  │  ├─ automata/                   정규식에서 DFA를 만드는 코드 (단계 1 ~ 3)
│  │  │  └─ charset.ts  regex.ts  nfa.ts  thompson.ts  dfa.ts  subset.ts
│  │  ├─ lexer/
│  │  │  ├─ token.ts              Token 클래스(format()), KEYWORDS
│  │  │  ├─ rules.ts              토큰 규칙표
│  │  │  ├─ scanner.ts            DFA 스캐너 (최대 일치)
│  │  │  └─ lexer.ts              Lexer (후처리, 진단)
│  │  ├─ grammar/                    문법에서 LALR 표를 만드는 코드 (단계 6 ~ 8)
│  │  │  └─ grammar.ts  first.ts  lr1.ts  lalr.ts  table.ts  lr-driver.ts
│  │  ├─ parser/
│  │  │  ├─ clef-grammar.ts       Clef의 BNF와 표
│  │  │  ├─ terminals.ts          토큰을 문법 터미널로 바꿈 (CALL_LP)
│  │  │  ├─ parser.ts             Parser
│  │  │  ├─ actions.ts            reduce 동작 (AST 생성)
│  │  │  └─ errors.ts             오류 진단 선택
│  │  ├─ ast/
│  │  │  └─ ast.ts                AST 타입, mapChildren
│  │  ├─ check/
│  │  │  └─ checker.ts            Checker (헤더, 이름, 타입, 재귀, 경고)
│  │  ├─ eval/
│  │  │  ├─ hir.ts                HIR 타입, compareEvents
│  │  │  ├─ ties.ts               resolveTies, nextNoteAfter
│  │  │  └─ evaluator.ts          Evaluator (AST에서 HIR)
│  │  ├─ opt/
│  │  │  ├─ pass.ts               Pass, PassPipeline
│  │  │  ├─ ast/inline.ts         InlinePass
│  │  │  ├─ ast/fold-transpose.ts FoldTransposePass
│  │  │  └─ hir/passes.ts         TieMergePass, RestMergePass
│  │  ├─ lower/
│  │  │  └─ lowerer.ts            Lowerer, LIR 타입, formatLir
│  │  ├─ smf/
│  │  │  └─ writer.ts             MidiWriter
│  │  ├─ emit/                    --emit 단계별 텍스트 출력기
│  │  │  ├─ tokens.ts  parse.ts  ast.ts  typed.ts  hir.ts  lir.ts
│  │  ├─ pipeline.ts              Compiler (퍼사드)
│  │  └─ index.ts                 공개 API: Compiler, SourceFile, 타입들
│  ├─ cli/
│  │  └─ main.ts                  clef <파일> [--emit 단계] [-O0] [-o 출력.mid]
│  └─ web/
│     ├─ main.ts                  입력창, 단계 탭, 진단 표시
│     └─ player.ts                LIR을 틱에서 초로 바꿔 재생
└─ tests/
   ├─ unit/                       rational, pitch, ties, smf 같은 순수 함수
   ├─ golden/
   │  ├─ golden.test.ts           골든 러너
   │  ├─ lexer/  parser/  ast/  check/  eval/  opt/  ir/
   │                             각 폴더에 이름.clef 와 이름.expected 쌍
   └─ property/                   fast-check 속성 테스트
```

### 파일별 책임

| 파일                        | 책임                                                   | 의존하는 것                                  |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| `common/span.ts`            | 소스 위치와 소스 줄 조회                               | 없음                                         |
| `common/rational.ts`        | 정확한 분수, 틱 변환                                   | 없음                                         |
| `diagnostics/diagnostic.ts` | 진단 수집, 정렬, 중복 제거, 출력 형식                  | `common`                                     |
| `music/pitch.ts`            | MIDI 번호, 이름, 음계, 온음계 이조                     | 없음                                         |
| `music/instruments.ts`      | 악기 이름, GM 번호, 음역, 채널 배정                    | 없음                                         |
| `automata/*`                | 정규식, NFA, DFA와 변환                                | 없음                                         |
| `lexer/*`                   | 문자열에서 토큰 배열 (규칙표, DFA 스캐너, 후처리)      | `common`, `diagnostics`, `music`, `automata` |
| `grammar/*`                 | 문법, FIRST, LR(1), LALR 표, LR 구동기                 | `lexer`(토큰 타입만)                         |
| `parser/*`                  | 토큰에서 AST, 문장 단위 오류 복구, 파스 트리           | `lexer`, `grammar`, `ast`, `diagnostics`     |
| `ast/*`                     | AST 타입, AST 공통 변환 도구                           | `common`                                     |
| `check/checker.ts`          | 이름 해석, 타입 검사, 재귀 검출, 경고, 헤더 확정       | `ast`, `music`                               |
| `eval/*`                    | AST를 평가해 HIR(유리수 시간) 생성, 길이와 붙임줄 검사 | `ast`, `check`, `music`                      |
| `opt/*`                     | AST 최적화와 HIR 최적화                                | `ast`, `eval`                                |
| `lower/lowerer.ts`          | HIR를 정수 틱의 LIR로 변환                             | `eval`                                       |
| `smf/writer.ts`             | LIR을 표준 MIDI 파일 바이트로 변환                     | `lower`, `music`                             |
| `emit/*`                    | 각 단계 산출물을 골든 파일과 같은 텍스트로 출력        | 각 단계 타입                                 |
| `pipeline.ts`               | 단계 호출 순서, 오류 시 중단, 산출물 모음              | 전부                                         |

## 객체 지향 설계

### 설계 원칙

1. **데이터는 불변의 합 타입으로, 행동은 클래스나 함수로 둔다.** Token, AST, HIR, LIR은 판별 유니온(`kind` 필드)이고 모든 필드가 `readonly`이다. 노드마다 클래스를 만들고 `accept(visitor)`를 두는 방식은 쓰지 않는다. TypeScript에서는 `switch (e.kind)`가 모든 경우를 다루지 않으면 컴파일 오류가 나므로 방문자 패턴과 같은 안전성을 더 적은 코드로 얻는다.
2. **한 단계는 한 클래스이다.** `Lexer`, `Parser`, `Checker`, `Evaluator`, `Lowerer`, `MidiWriter`는 생성자로 입력과 `DiagnosticBag`을 받고, 공개 메서드 하나(`tokenize`, `parseAst`, `check`, `evaluate`, `lower`, `write`)로 결과를 돌려준다. 진행 상태(위치, 심볼 표, 호출 그래프)는 `private` 필드로 가둔다. 한 인스턴스는 한 번만 실행한다.
3. **오류는 값으로 모으고, 예외는 문장 단위 복구에만 쓴다.** 사용자 소스의 오류는 `DiagnosticBag`에 쌓는다. 평가기의 `EvalAbort`는 "이 문장은 포기하고 다음 문장으로 간다"를 구현하는 내부 예외이며 클래스 밖으로 나가지 않는다. 컴파일러 자신의 버그는 일반 `Error`로 던져 조용히 넘어가지 않게 한다.
4. **최적화는 `Pass<T>` 인터페이스를 구현하는 작은 클래스로 만든다.** `PassPipeline<T>`가 목록을 순서대로 돌린다. `mandatory`인 단계는 `-O0`에서도 실행한다. 새 최적화는 클래스 하나와 목록에 한 줄 추가이다.
5. **순수 함수 모듈을 따로 둔다.** `Rational`, `diatonicShift`, `resolveTies`, `formatLength`는 상태가 없는 함수나 불변 클래스라서 단위 테스트가 가장 쉽고 가장 먼저 만든다.
6. **`Compiler`는 퍼사드이다.** CLI와 웹은 `Compiler.compile(file, options)`만 호출하고 각 단계 클래스를 직접 쓰지 않는다.

### 클래스 구성

```mermaid
classDiagram
  class Compiler {
    +compile(file, options) CompileResult
  }
  class DiagnosticBag {
    +error(code, span, message, help)
    +warn(code, span, message, help)
    +hasErrors() boolean
    +sorted() Diagnostic[]
    +capped() CappedDiagnostics
  }
  class Diagnostic {
    +format() string
    +formatFull(file) string
  }
  class Lexer {
    +tokenize() Token[]
  }
  class Parser {
    +parseAst() Program
    +parseTree() ParseTree
  }
  class Checker {
    +check() CheckResult
  }
  class Evaluator {
    +evaluate() HirProgram
  }
  class Lowerer {
    +lower(hir) LirProgram
  }
  class MidiWriter {
    +write(lir) Uint8Array
  }
  class Pass {
    <<interface>>
    +name string
    +mandatory boolean
    +run(input) T
  }
  class PassPipeline {
    +run(input, level) T
  }
  class InlinePass
  class FoldTransposePass
  class TieMergePass
  class RestMergePass

  Compiler --> Lexer
  Compiler --> Parser
  Compiler --> Checker
  Compiler --> PassPipeline
  Compiler --> Evaluator
  Compiler --> Lowerer
  Compiler --> MidiWriter
  Lexer ..> DiagnosticBag
  Parser ..> DiagnosticBag
  Checker ..> DiagnosticBag
  Evaluator ..> DiagnosticBag
  PassPipeline o-- Pass
  Pass <|.. InlinePass
  Pass <|.. FoldTransposePass
  Pass <|.. TieMergePass
  Pass <|.. RestMergePass
```

단계 흐름은 다음과 같다. 실선은 정상 흐름이고, 어느 단계든 오류가 있으면 그 단계 산출물까지 담아 `CompileResult`를 돌려주고 멈춘다.

```mermaid
flowchart LR
  S[소스] --> L[Lexer]
  L --> P[Parser]
  P --> C[Checker]
  C --> A[AST 최적화]
  A --> E[Evaluator]
  E --> H[HIR 최적화]
  H --> W[Lowerer]
  W --> M[MidiWriter]
```

### 의존 방향

화살표 방향으로만 import한다. 반대 방향 import가 필요해 보이면 공통 타입을 아래 계층으로 내린다.

```text
common  <-  diagnostics
common  <-  music
common  <-  automata  <-  lexer  <-  grammar  <-  parser  (parser는 ast, diagnostics도 본다)
common  <-  ast
parser, ast, music  <-  check  <-  eval  <-  opt  (AST 최적화는 ast, HIR 최적화는 eval을 본다)
eval  <-  lower  <-  smf
emit  <-  위 모든 타입 (읽기만 한다)
pipeline  <-  위 전부
cli, web  <-  pipeline 과 emit 만
```

규칙 두 가지를 어기지 않는다. 첫째, `core` 안에서 `node:` 모듈과 DOM을 쓰지 않는다. 그래야 CLI와 브라우저가 같은 코드를 쓴다. 둘째, 한 단계는 이전 단계의 산출물 타입만 알고 그 단계의 클래스는 모른다.

## 모듈별 구현

### 공통 계층

`Span`은 한 줄 안의 구간이고 줄과 열을 1부터 센다. `SourceFile`은 진단 출력에서 해당 소스 줄을 꺼내는 데 쓴다.

`src/core/common/span.ts`

```ts
/** 소스 안의 한 구간. 줄과 열은 모두 1부터 센다. 한 토큰은 한 줄 안에 있다. */
export interface Span {
  readonly line: number;
  readonly col: number;
  readonly endCol: number;
}

export function span(line: number, col: number, endCol: number): Span {
  return { line, col, endCol };
}

/** 소스 전체와 줄별 접근을 담당한다. 진단 출력에서 해당 줄을 꺼낼 때 쓴다. */
export class SourceFile {
  private readonly lines: readonly string[];

  constructor(
    readonly name: string,
    readonly text: string,
  ) {
    this.lines = text.split('\n');
  }

  lineText(line: number): string {
    return (this.lines[line - 1] ?? '').replace(/\r$/, '');
  }

  get lineCount(): number {
    return this.lines.length;
  }
}
```

`Rational`은 기약 분수로 정규화된 불변 객체이다. 시간 단위는 온음표를 1로 둔다. 틱 변환은 `toTicks(1920n)`이 정수가 아니면 `null`을 돌려주는 방식이고, `null`이 E302의 근거가 된다.

`src/core/common/rational.ts`

```ts
const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
};

/**
 * 기약 분수로 정규화된 불변 유리수. 분모는 항상 양수다.
 * 시간 단위는 온음표 = 1이다.
 */
export class Rational {
  static readonly ZERO = new Rational(0n, 1n);
  static readonly ONE = new Rational(1n, 1n);

  private constructor(
    readonly num: bigint,
    readonly den: bigint,
  ) {}

  static of(num: bigint | number, den: bigint | number = 1n): Rational {
    let n = BigInt(num);
    let d = BigInt(den);
    if (d === 0n) throw new RangeError('zero denominator');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    return new Rational(n / g, d / g);
  }

  add(o: Rational): Rational {
    return Rational.of(this.num * o.den + o.num * this.den, this.den * o.den);
  }
  sub(o: Rational): Rational {
    return Rational.of(this.num * o.den - o.num * this.den, this.den * o.den);
  }
  mul(o: Rational): Rational {
    return Rational.of(this.num * o.num, this.den * o.den);
  }
  div(o: Rational): Rational {
    return Rational.of(this.num * o.den, this.den * o.num);
  }

  /** 음수, 0, 양수를 돌려준다. */
  cmp(o: Rational): number {
    const l = this.num * o.den;
    const r = o.num * this.den;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  equals(o: Rational): boolean {
    return this.num === o.num && this.den === o.den;
  }
  isZero(): boolean {
    return this.num === 0n;
  }
  isInteger(): boolean {
    return this.den === 1n;
  }

  /** 온음표당 틱 수를 곱해 정수가 되면 그 값을, 아니면 null을 돌려준다. */
  toTicks(ticksPerWhole: bigint): bigint | null {
    const scaled = this.num * ticksPerWhole;
    return scaled % this.den === 0n ? scaled / this.den : null;
  }

  toString(): string {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
  }
}

export function maxRational(a: Rational, b: Rational): Rational {
  return a.cmp(b) >= 0 ? a : b;
}
```

### 진단

진단은 `DiagnosticBag` 하나에 모은다. 출력 전에 `sorted()`를 거치며, 같은 코드와 위치와 메시지는 하나로 합치고 (줄, 열, 코드) 순으로 정렬한다. 자르지는 않는다. 출력하는 쪽이 `capped()`로 앞의 50개와 넘친 개수를 받고, 넘쳤으면 마지막 줄에 `too many errors`를 붙인다. 50개는 경고를 포함한 진단 전체의 수이다(SPEC을 따른다). 중복 제거가 필요한 이유는 인라이닝 때문이다. 인수 식이 본문에 복제되면 같은 오류가 두 번 나올 수 있고, `-O0`과 같은 출력을 내려면 합쳐야 한다.

`Diagnostic.format()`은 골든 테스트가 쓰는 `줄:열 종류[코드]: 메시지` 형식이고 `help`는 줄을 바꾸고 탭 하나로 들여 쓴다. `Diagnostic.formatFull(file)`은 CLI가 쓰는 소스 줄과 밑줄이 있는 형식이다. 출력 함수는 따로 두지 않고 `Diagnostic`과 `DiagnosticBag`의 메서드로 둔다.

`src/core/diagnostics/diagnostic.ts`

```ts
import type { Span } from '../common/span.ts';
import type { SourceFile } from '../common/span.ts';

export type Severity = 'error' | 'warning';

export type DiagCode =
  | 'E001'
  | 'E002'
  | 'E003'
  | 'E004'
  | 'E010'
  | 'E011'
  | 'E101'
  | 'E102'
  | 'E103'
  | 'E104'
  | 'E201'
  | 'E203'
  | 'E204'
  | 'E301'
  | 'E302'
  | 'E303'
  | 'E304'
  | 'E305'
  | 'E306'
  | 'E307'
  | 'E401'
  | 'E402'
  | 'E403'
  | 'W601'
  | 'W602'
  | 'W603';

export class Diagnostic {
  constructor(
    readonly severity: Severity,
    readonly code: DiagCode,
    readonly message: string,
    readonly span: Span,
    readonly help?: string | undefined,
  ) {}

  /** 골든 테스트용 짧은 형식. 예: "1:21 error[E307]: ..." */
  format(): string {
    const head = `${this.span.line}:${this.span.col} ${this.severity}[${this.code}]: ${this.message}`;
    return this.help ? `${head}\n\thelp: ${this.help}` : head;
  }

  /** CLI용 전체 형식. 소스 줄과 밑줄을 함께 보여 준다. */
  formatFull(file: SourceFile): string {
    const { line, col, endCol } = this.span;
    const gutter = String(line);
    const pad = ' '.repeat(gutter.length);
    const underline = ' '.repeat(col - 1) + '^'.repeat(Math.max(1, endCol - col));
    const out = [
      `${file.name}:${line}:${col}: ${this.severity}[${this.code}]: ${this.message}`,
      `${gutter} | ${file.lineText(line)}`,
      `${pad} | ${underline}`,
    ];
    if (this.help) out.push(`${pad} = help: ${this.help}`);
    return out.join('\n');
  }
}

/** `DiagnosticBag.capped()`의 결과. hidden이 0보다 크면 출력 끝에 `too many errors`를 붙인다. */
export interface CappedDiagnostics {
  readonly shown: Diagnostic[];
  readonly hidden: number;
}

const MAX_DIAGNOSTICS = 50;

/** 컴파일 한 번 동안 모든 단계가 공유하는 진단 수집기. */
export class DiagnosticBag {
  private readonly items: Diagnostic[] = [];

  error(code: DiagCode, span: Span, message: string, help?: string): void {
    this.items.push(new Diagnostic('error', code, message, span, help));
  }

  warn(code: DiagCode, span: Span, message: string, help?: string): void {
    this.items.push(new Diagnostic('warning', code, message, span, help));
  }

  hasErrors(): boolean {
    return this.items.some((d) => d.severity === 'error');
  }

  errorCount(): number {
    return this.items.filter((d) => d.severity === 'error').length;
  }

  /** 같은 진단은 하나로 합치고 (줄, 열, 코드) 순으로 정렬한다. 개수는 자르지 않는다. */
  sorted(): Diagnostic[] {
    const seen = new Set<string>();
    const unique = this.items.filter((d) => {
      const key = `${d.code}|${d.span.line}|${d.span.col}|${d.message}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });
    return unique.sort(
      (a, b) =>
        a.span.line - b.span.line ||
        a.span.col - b.span.col ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    );
  }

  /** 정렬한 진단의 앞 50개와 넘친 개수. 출력하는 쪽이 이것을 쓴다. */
  capped(): CappedDiagnostics {
    const all = this.sorted();
    return {
      shown: all.slice(0, MAX_DIAGNOSTICS),
      hidden: Math.max(0, all.length - MAX_DIAGNOSTICS),
    };
  }
}
```

### 음악 도메인

MIDI 번호는 `12 * (옥타브 + 1) + 음이름 + 임시표`이다(C4 = 60). 진단 메시지에 쓰는 이름은 항상 올림표로 쓴다(61은 `C#4`).

`diatonicShift`는 스펙의 온음계 이조를 구현한다. 으뜸음 기준 오프셋이 음계에 없으면 `null`을 돌려주고, 호출 쪽이 E307을 보고한다. 음수 계단은 `Math.floor`로 옥타브를 계산해 같은 식으로 처리한다.

`src/core/music/pitch.ts`

```ts
export type Accidental = '' | '#' | 'b';
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type Mode = 'major' | 'minor';

const LETTER_PC: Readonly<Record<Letter, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** 음이름과 임시표에서 0 이상 11 이하의 음높이 클래스를 구한다. */
export function pitchClass(letter: Letter, acc: Accidental): number {
  const delta = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  return (((LETTER_PC[letter] + delta) % 12) + 12) % 12;
}

/** MIDI 번호. C4 = 60. 옥타브 0부터 9까지, 임시표 때문에 범위 밖이 될 수 있어 호출 쪽에서 검사한다. */
export function midiOf(letter: Letter, acc: Accidental, octave: number): number {
  const delta = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  return 12 * (octave + 1) + LETTER_PC[letter] + delta;
}

/** 진단 메시지용 이름. 항상 올림표로 쓴다. 60 -> "C4". */
export function pitchName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  return `${SHARP_NAMES[pc] ?? '?'}${Math.floor(midi / 12) - 1}`;
}

export const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
/** 자연 단음계만 지원한다. */
export const MINOR_SCALE: readonly number[] = [0, 2, 3, 5, 7, 8, 10];

export function scaleOf(mode: Mode): readonly number[] {
  return mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
}

/**
 * 조성의 음계 위에서 steps계단 이동한다.
 * pitch가 음계 밖의 음이면 null을 돌려주고, 호출 쪽이 E307을 보고한다.
 */
export function diatonicShift(
  pitch: number,
  steps: number,
  tonicPc: number,
  scale: readonly number[],
): number | null {
  const offset = (((pitch - tonicPc) % 12) + 12) % 12;
  const k = scale.indexOf(offset);
  if (k < 0) return null;
  const base = pitch - offset;
  const k2 = k + steps;
  const oct = Math.floor(k2 / 7);
  const deg = k2 - 7 * oct;
  return base + 12 * oct + (scale[deg] as number);
}
```

검증한 값은 다음과 같다.

| 호출                   | 결과          |
| ---------------------- | ------------- |
| C장조, `C4(60) +2d`    | 64 (E4)       |
| C장조, `D4(62) +2d`    | 65 (F4)       |
| A단조, `A4(69) +2d`    | 72            |
| G장조, `B4(71) +2d`    | 74            |
| C장조, `C4 -1d`        | 59            |
| C장조, `C4 +7d`, `-7d` | 72, 48        |
| C장조, `C#4(61) +2d`   | `null` (E307) |

악기표는 초안 값이다. 음역과 GM 번호는 구현하면서 바꿀 수 있고, 한 곳에만 있으므로 수정 범위가 작다. 채널 9(타악기)는 건너뛰어 트랙은 최대 15개이다.

`src/core/music/instruments.ts`

```ts
export class Instrument {
  /** 초안 값이다. 음역과 프로그램 번호는 구현하면서 확정한다. */
  static readonly ALL: readonly Instrument[] = [
    new Instrument('piano', 0, 21, 108),
    new Instrument('guitar', 24, 40, 88),
    new Instrument('bass', 32, 28, 67),
    new Instrument('cello', 42, 36, 84),
    new Instrument('violin', 40, 55, 100),
    new Instrument('flute', 73, 60, 96),
  ];

  private static readonly BY_NAME = new Map(Instrument.ALL.map((i) => [i.name, i]));

  constructor(
    readonly name: string,
    /** General MIDI 프로그램 번호, 0부터 시작. */
    readonly program: number,
    /** 연주 가능한 MIDI 음 범위(양 끝 포함). */
    readonly low: number,
    readonly high: number,
  ) {}

  static find(name: string): Instrument | undefined {
    return Instrument.BY_NAME.get(name);
  }

  /** 채널 9는 타악기라 건너뛴다. 15개를 넘으면 undefined. */
  static channelFor(trackIndex: number): number | undefined {
    const channel = trackIndex < 9 ? trackIndex : trackIndex + 1;
    return channel <= 15 ? channel : undefined;
  }

  /** 음이 이 악기의 음역 안에 있는지. */
  inRange(midi: number): boolean {
    return this.low <= midi && midi <= this.high;
  }
}
```

### 렉서

렉서는 토큰 규칙을 정규식으로 적고 Thompson 구성과 부분집합 구성으로 DFA를 만들어 쓴다. 이 절의 단계 1 ~ 5가 그 설계와 구현 순서이다. 앞부분은 다른 모듈이 알아야 하는 것이다.

- 토큰은 `src/core/lexer/token.ts`의 클래스(`NoteToken`, `PitchClassToken`, `IdentToken`, `IntToken`, `IntervalToken`, `SimpleToken`)이다. 공통 필드는 `lexeme`, `span`, `spaceBefore`이고 `format()`이 `--emit tokens`의 한 토큰을 낸다.
- `spaceBefore`는 `f(m1)`(호출)과 `f (m1)`(나열)을 파서가 구분하는 유일한 근거이다. 렉서는 두 경우 모두 `LPAREN`을 낸다.
- `KEYWORDS` 맵은 키워드 규칙을 만드는 입력이다.
- 공개 메서드는 `Lexer.tokenize(): Token[]` 하나이다. 내부는 `lexer/rules.ts`의 규칙표, `lexer/scanner.ts`의 DFA 스캐너, `lexer/lexer.ts`의 후처리(spaceBefore, 괄호 깊이, NEWLINE)로 나뉜다.
- E001 ~ E003은 가장 낮은 우선순위의 오류 규칙이 보고한다. 오류가 난 부분은 버리고 계속 읽는다.
- 검증 입력은 스펙의 1단계 예시이고, 추가 입력은 단계 4와 5의 시험 표이다.

### 단계 1: 문자 집합과 정규식 AST

#### 목표

정규식을 자료구조로 표현하고, 문자 집합을 다룬다. HW1의 `Regex.py`에 해당한다. HW1은 알파벳을 `a-z`, `A-Z`, `0-9`, `_`로 고정했지만, Clef의 주석에는 한글이 올 수 있고 `[^\n]`이 필요하므로 문자 집합을 코드 포인트 구간으로 표현한다.

#### 만들 것

`automata/charset.ts`:

```ts
// 닫힌 구간 [lo, hi]의 정렬된 목록. 서로 겹치지 않는다.
export class CharSet {
  static of(...chars: string[]): CharSet;
  static range(lo: string, hi: string): CharSet;
  static any(): CharSet; // 0 ~ 0x10FFFF
  union(o: CharSet): CharSet;
  complement(): CharSet; // [^\n]을 만들 때 쓴다
  has(cp: number): boolean;
}

// NFA의 모든 간선 집합을 받아, 어느 간선에서도 구분되지 않는 문자끼리 묶은 분할을 돌려준다.
export function partition(sets: CharSet[]): CharSet[];
```

`partition`이 중요하다. 부분집합 구성(단계 3)은 알파벳의 각 기호마다 전이를 계산하는데, 유니코드 전체를 기호 하나씩 순회할 수는 없다. 구간의 경계점을 모아 정렬하고 경계 사이를 하나의 "문자 종류"로 묶으면 종류 수는 수십 개로 줄어든다. 스캐너는 문자의 종류 번호를 이분 탐색으로 찾고, ASCII는 128칸 표를 따로 둔다.

`automata/regex.ts`:

```ts
export type Regex =
  | { kind: 'empty' }                               // 공집합
  | { kind: 'eps' }                                 // ε
  | { kind: 'set'; set: CharSet }                   // 글자 하나 (HW1의 Symbol, SymbolSet)
  | { kind: 'cat'; left: Regex; right: Regex }
  | { kind: 'alt'; left: Regex; right: Regex }
  | { kind: 'star'; expr: Regex };

// 규칙을 짧게 쓰기 위한 도우미
export const lit = (s: string): Regex => /* 글자 열 */;
export const cat = (...r: Regex[]): Regex => /* ... */;
export const alt = (...r: Regex[]): Regex => /* ... */;
export const star = (r: Regex): Regex => /* ... */;
export const plus = (r: Regex): Regex => cat(r, star(r));
export const opt = (r: Regex): Regex => alt(r, eps);

// 시험용. 같은 언어를 JS 정규식 문자열로 바꾼다.
export function toJsSource(r: Regex): string;
```

#### 수업 연결

정규식의 세 연산(합, 연결, 클레이니 스타)과 `r+`, `r?`가 이 세 연산의 줄임말이라는 점이다.

#### 시험

- `partition([range('a','z'), range('a','m')])`은 `[a-m]`, `[n-z]` 두 종류와 나머지를 돌려준다.
- `toJsSource`의 출력을 `new RegExp('^(?:' + src + ')$', 'u')`에 넣어 몇 가지 문자열을 맞춰 본다. 이 함수는 단계 2와 3에서 오라클로 계속 쓴다.

### 단계 2: NFA와 Thompson 구성

#### 목표

정규식에서 ε 간선이 있는 NFA를 만든다. HW1의 `Nfa.py`에 해당한다.

#### 만들 것

`automata/nfa.ts`:

```ts
export type StateId = number;
export interface Edge {
  readonly on: CharSet;
  readonly to: StateId;
}

export class Nfa {
  readonly eps = new Map<StateId, Set<StateId>>();
  readonly edges = new Map<StateId, Edge[]>();
  // 최종 상태마다 어느 규칙의 끝인지를 표시한다. 단계 4에서 규칙 번호로 쓴다.
  readonly accept = new Map<StateId, number>();
  newState(): StateId;
  addEps(from: StateId, to: StateId): void;
  addEdge(from: StateId, on: CharSet, to: StateId): void;
}
```

`automata/thompson.ts`는 정규식 하나를 받아 시작 상태 하나, 끝 상태 하나를 가진 조각을 돌려준다.

| 정규식      | 구성                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| 한 글자 `c` | 시작에서 끝으로 `c` 간선                                                       |
| `ε`         | 시작에서 끝으로 ε 간선                                                         |
| `r s`       | `r`의 끝에서 `s`의 시작으로 ε 간선                                             |
| `r \| s`    | 새 시작에서 두 조각의 시작으로, 두 조각의 끝에서 새 끝으로 ε 간선              |
| `r*`        | 새 시작에서 `r`의 시작과 새 끝으로, `r`의 끝에서 `r`의 시작과 새 끝으로 ε 간선 |

```ts
export function thompson(nfa: Nfa, r: Regex): { start: StateId; end: StateId };
```

#### 수업 연결

Thompson 구성의 다섯 규칙이다. 조각마다 시작 상태와 끝 상태가 하나씩이고, 끝 상태에서 나가는 간선이 없다는 성질이 연결 규칙을 단순하게 만든다.

#### 시험

정규식에서 NFA를 만들고, NFA를 ε 폐포로 직접 시뮬레이션하는 `accepts(nfa, s)`를 시험용으로 만든다. 알파벳 `{a, b, c}` 위에서 길이 6 이하의 모든 문자열을 만들어 `toJsSource`의 JS 정규식 결과와 비교한다. 수업 노트의 `a(b|c)*`와 "뒤에서 두 번째 비트가 1인 문자열"을 넣는다.

### 단계 3: DFA와 부분집합 구성

#### 목표

NFA를 DFA로 바꾼다. HW1의 `Dfa.py`와 수업의 worklist 알고리즘에 해당한다.

#### 만들 것

```ts
// automata/subset.ts
export function epsClosure(nfa: Nfa, states: Iterable<StateId>): Set<StateId>;

export interface Dfa {
  readonly classes: CharSet[]; // partition 결과
  readonly start: number; // 0
  readonly delta: Int32Array; // [상태 * 종류 수 + 종류] -> 상태, 없으면 -1
  readonly accept: Int32Array; // 상태 -> 규칙 번호, 없으면 -1
  readonly stateCount: number;
}
export function subsetConstruct(nfa: Nfa, start: StateId): Dfa;
```

알고리즘은 수업 노트와 같다.

```text
d0 <- epsClosure({n0})
D <- {d0}, W <- {d0}
while W is not empty:
    q <- W에서 하나 꺼냄
    for each 종류 c:
        t <- epsClosure( union of move(s, c) for s in q )
        if t is empty: 건너뜀              // 죽은 상태는 만들지 않는다
        if t not in D: D <- D + {t}, W <- W + {t}
        delta(q, c) <- t
accept(q) <- q에 들어 있는 NFA 최종 상태의 규칙 번호 중 가장 작은 것
```

상태 집합을 `D`의 키로 쓰려면 정렬한 상태 번호를 `join(',')`한 문자열을 쓰면 된다. 수업 알고리즘과 다른 점은 두 가지이다. 알파벳 기호 대신 문자 종류를 순회하고, 하나의 DFA 상태가 여러 규칙의 최종 상태를 포함할 때 번호가 가장 작은 규칙을 고른다는 점이다. 후자가 토큰 우선순위를 구현한다(단계 4).

#### 수업 연결

부분집합 구성, ε 폐포, worklist. 고정점에 도달하면 끝난다는 종료 근거.

#### 시험

- "뒤에서 두 번째 비트가 1인 문자열" NFA는 DFA 상태 4개가 나온다.
- 단계 2와 같은 방식으로, DFA를 시뮬레이션한 결과가 JS 정규식 결과와 일치하는지 길이 6 이하의 모든 문자열로 비교한다.
- `fast-check`로 임의의 작은 정규식을 만들어 같은 비교를 한다. 정규식 생성기는 재귀 깊이 4로 제한한다.

### 단계 4: Clef 토큰 규칙과 최대 일치 스캐너

#### 목표

Clef의 토큰을 정규식 목록으로 적고, 이를 하나의 DFA로 합쳐 최대 일치(maximal munch) 규칙으로 글자열을 토큰으로 자른다.

#### 규칙표

`lexer/rules.ts`에 목록 순서가 곧 우선순위인 규칙표를 둔다. 같은 길이로 두 규칙이 맞으면 앞의 규칙이 이긴다.

키워드 규칙 12개는 `token.ts`의 `KEYWORDS` 맵을 순회해 만든다. 맵은 단어와 종류의 유일한 근거로 남고, IDENT를 읽은 뒤 맵을 조회하는 방식은 쓰지 않는다. `timer`는 IDENT가 더 길게 맞아 IDENT가 되고, `time`은 길이가 같아 앞 순번인 키워드가 이긴다. 키워드를 구별하는 일을 오토마타가 맡는 것이 이 단계의 요점이다.

```ts
export interface LexRule {
  readonly name: string;
  readonly re: Regex;
  readonly kind: 'token' | 'skip' | 'error';
  // token이면 Token을, error이면 진단 정보를 만든다.
  readonly make?: (lexeme: string, span: Span, spaceBefore: boolean) => Token;
  readonly diag?: (
    lexeme: string,
    span: Span,
  ) => { code: DiagCode; message: string; help?: string };
}
```

| 순서 | 규칙         | 정규식                                                                                                                       | 종류        |
| ---- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1    | COMMENT      | `//[^\n]*`                                                                                                                   | skip        |
| 2    | WS           | `[ \t\r]+`                                                                                                                   | skip        |
| 3    | NEWLINE      | `\n`                                                                                                                         | token       |
| 4    | 키워드 12개  | `KEYWORDS`에서 만든다: `time`, `key`, `tempo`, `unit`, `track`, `def`, `major`, `minor`, `Note`, `Interval`, `Phrase`, `Int` | token       |
| 5    | NOTE         | `[A-G][#b]?[0-9]`                                                                                                            | token       |
| 6    | PITCHCLASS   | `[A-G][#b]?`                                                                                                                 | token       |
| 7    | INTERVAL     | `[0-9]+(d\|st)`                                                                                                              | token       |
| 8    | INT          | `[0-9]+`                                                                                                                     | token       |
| 9    | IDENT        | `[a-z][a-zA-Z0-9_]*`                                                                                                         | token       |
| 10   | REST         | `_`                                                                                                                          | token       |
| 11   | 구두점 14개  | `=` `+` `-` `*` `&` `:` `/` `(` `)` `[` `]` `,` `\|` `~`                                                                     | token       |
| 12   | BAD_NOTE     | `[A-G][#b]?[A-Za-z0-9_]+`                                                                                                    | error, E002 |
| 13   | BAD_INTERVAL | `[0-9]+[A-Za-z_][A-Za-z0-9_]*`                                                                                               | error, E003 |
| 14   | BAD_WORD     | `[A-Z][A-Za-z0-9_]*`                                                                                                         | error, E001 |
| 15   | BAD_REST     | `_[A-Za-z0-9_]+`                                                                                                             | error, E001 |

오류도 정규식으로 적는 것이 이 설계의 핵심이다. 최대 일치 규칙 덕분에 `C4`는 NOTE와 BAD_NOTE가 같은 길이로 맞고 우선순위가 앞선 NOTE가 이긴다. `C10`과 `C4x`는 BAD_NOTE가 더 길게 맞으므로 BAD_NOTE가 이긴다. `Cx`와 `Foo`도 BAD_NOTE이다. `Cb`는 PITCHCLASS와 BAD_NOTE가 같은 길이로 맞아 앞선 PITCHCLASS가 이긴다. `Note`는 키워드가 BAD_WORD와 같은 길이이므로 키워드가 이기고, `Notes`는 BAD_WORD가 더 길어 E001이 된다. `timer`는 IDENT가 `time`보다 길어서 IDENT이다. 어떤 규칙에도 맞지 않는 글자(`?`, `#`, `.`)는 E001이다.

#### 스캐너

```ts
// lexer/scanner.ts
export function compileRules(rules: readonly LexRule[]): Dfa {
  // 새 시작 상태에서 각 규칙의 NFA 시작으로 ε 간선을 잇고,
  // 각 규칙의 끝 상태에 규칙 번호를 accept로 표시한 뒤 subsetConstruct를 호출한다.
}

export function scan(
  dfa: Dfa,
  rules: readonly LexRule[],
  src: SourceFile,
  diag: DiagnosticBag,
): RawToken[];
```

스캔 루프는 수업의 "가장 긴 접두사를 찾는" 방식이다.

```text
pos <- 0
while pos < n:
    q <- 시작, last <- 없음, i <- pos
    while i < n:
        q <- delta[q][종류(src[i])]
        if q is dead: break
        i <- i + 1
        if accept[q] is defined: last <- (i, accept[q])
    if last is 없음: E001을 pos 위치에 보고, pos <- pos + 1
    else: 규칙에 따라 토큰, 건너뜀, 오류 중 하나를 처리하고 pos <- last.i
```

`last`로 되돌아가는 부분이 최대 일치의 핵심이다. `2dx`를 읽을 때 DFA는 `2d`까지 INTERVAL로 받아들이는 상태를 지나 `x`에서도 BAD_INTERVAL 상태로 계속 가므로, 끝에서 `last`는 `2dx` 전체가 된다.

위치는 줄과 열을 1부터 센다. 문자는 `for (const ch of src)`처럼 코드 포인트로 센다. 탭도 1열이다.

#### 수업 연결

토큰 정의, 정규식, NFA, DFA를 거쳐 실행 코드로 가는 파이프라인 전체이다. 노트의 "Lex 같은 도구가 내부에서 하는 일"을 직접 구현한 것이다.

#### 시험

SPEC의 1단계 입력과 아래 추가 입력을 이 스캐너로 돌린다(후처리 없이 토큰 이름만 비교).

| 입력                                   | 기대                                                        |
| -------------------------------------- | ----------------------------------------------------------- |
| `m1 = C#4 c4 E4:2~ \|`                 | IDENT EQ NOTE IDENT NOTE COLON INT TIE BAR                  |
| `m1+2d`                                | IDENT PLUS INTERVAL                                         |
| `time 4/4`                             | KW_TIME INT SLASH INT                                       |
| `key C minor`                          | KW_KEY PITCHCLASS KW_MINOR                                  |
| `timer time`                           | IDENT(timer) KW_TIME                                        |
| `C4x Cx Foo 2dx 2st _a _ Bb3 Bb Hello` | E002 E002 E002 E003 INTERVAL E001 REST NOTE PITCHCLASS E001 |
| `m1 = C10`                             | IDENT EQ E002(1:6)                                          |
| `m1 = ?`                               | IDENT EQ E001(1:6)                                          |
| `x = 1 // 한글 주석`                   | IDENT EQ INT (주석은 토큰이 아니다)                         |

내 임시 구현에서 규칙 39개(키워드 12개와 구두점 14개 포함)의 NFA는 상태 245개, DFA는 92개였다. NFA 상태 수는 Thompson 구성을 어떻게 쓰느냐에 따라 달라지므로 참고만 하고, DFA가 크게 어긋나면 규칙을 잘못 쓴 것이다.

### 단계 5: 토큰 후처리, 오류 보고, 렉서 완성

#### 목표

스캐너가 내는 날 토큰 열에서 SPEC의 어휘 규칙 중 정규 언어로 표현되지 않는 부분을 처리하고, 오류를 `DiagnosticBag`에 보고해 `Lexer.tokenize()`를 완성한다.

정규식과 유한 오토마타는 중첩 구조를 다룰 수 없다는 것이 수업에서 CFG로 넘어가는 이유였다. `(` 안에서 NEWLINE을 만들지 않는다는 규칙이 괄호 깊이를 세어야 하므로 이 한계에 정확히 걸린다. 그래서 이 부분만 DFA 밖의 후처리로 둔다.

#### 후처리 규칙

토큰 열을 앞에서부터 한 번 훑으며 다음을 처리한다.

1. **spaceBefore**: 직전에 WS나 COMMENT가 있었으면 다음 토큰의 `spaceBefore`를 `true`로 한다.
2. **괄호 깊이**: `LPAREN`, `LBRACKET`을 만나면 깊이를 1 올리고, `RPAREN`, `RBRACKET`을 만나면 깊이가 0보다 클 때만 1 내린다. 깊이가 0일 때 나온 닫는 괄호는 그대로 파서에 넘긴다.
3. **NEWLINE**: 깊이가 0보다 크면 버린다. 깊이가 0이면 직전 토큰이 NEWLINE이거나 아직 토큰이 없는 경우를 제외하고 낸다.
4. **EOF**: 마지막 토큰이 NEWLINE이 아니면 깊이와 관계없이 NEWLINE을 먼저 낸다. 열린 괄호가 남은 채로 입력이 끝나도 파서가 "문장 끝에서의 오류"로 볼 수 있어야 E011을 낼 수 있다.

#### 오류 보고

| 규칙                                          | 코드 | 메시지                                                                                    | 위치           |
| --------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- | -------------- |
| BAD_NOTE (숫자가 있음)                        | E002 | `invalid note 'C10': the octave must be a single digit`                                   | 토큰 시작      |
| BAD_NOTE (숫자가 없음)                        | E002 | `invalid note 'Foo': a note is a letter A to G, an optional # or b, and one octave digit` | 토큰 시작      |
| BAD_INTERVAL                                  | E003 | `invalid interval '2x': use d (scale steps) or st (semitones)`                            | 토큰 시작      |
| INT 리터럴이 `Number.MAX_SAFE_INTEGER`를 넘음 | E004 | `integer literal too large: '99999999999999999999'`                                       | 토큰 시작      |
| BAD_WORD, BAD_REST, 맞는 규칙이 없는 글자     | E001 | `unexpected character '?'` 또는 `unexpected word 'Foo'`                                   | 그 글자나 단어 |

오류가 난 토큰은 버리고 계속 읽는다. 토큰 열에서 오류 토큰은 빠지지만 진단은 남는다. 렉서에 오류가 있으면 이후 단계를 돌리지 않는다(결정 6).

닫히지 않은 괄호(E011)는 렉서가 아니라 파서가 보고한다(결정 5).

#### 토큰 만들기

`make`는 규칙 이름과 lexeme에서 `Token` 클래스를 만든다. NOTE는 `lexeme[0]`이 음 이름, `#` 또는 `b`가 있으면 임시표, 마지막 글자가 옥타브이다. INTERVAL은 끝이 `st`이면 반음, `d`이면 계단이다. 키워드와 구두점은 `SimpleToken`이다. INT는 `Number(lexeme)`가 안전 정수(`Number.isSafeInteger`)가 아니면 E004를 보고하고 토큰을 버린다. BigInt는 쓰지 않는다.

#### 이정표 1

SPEC의 1단계 테스트 7개가 모두 통과하고, `tests/golden/lexer/`에 `.clef`와 `.expected` 쌍을 둔다. `Lexer`의 공개 메서드는 `tokenize(): Token[]`이다. 내부가 DFA 표로 바뀌었을 뿐 호출하는 쪽은 달라지지 않는다. `canon.clef`와 `program-p.clef`를 토큰화해 오류가 없는지도 본다.

### 문법

단계 6 이후에 쓰는 Clef 문법이다. SPEC의 EBNF를 BNF로 풀어 쓰고, 줄 단위로 바꾸고, `error` 생산을 넣었다. 대문자는 터미널, 첫 글자만 대문자인 이름은 논터미널이다. `ε`은 빈 생산이다.

```text
Program   -> Lines
Lines     -> Lines Line | ε
Line      -> Header NEWLINE | Stmt NEWLINE | ERROR NEWLINE

Header    -> KW_TIME INT SLASH INT
           | KW_KEY PITCHCLASS | KW_KEY PITCHCLASS KW_MAJOR | KW_KEY PITCHCLASS KW_MINOR
           | KW_TEMPO INT
           | KW_UNIT INT SLASH INT

Stmt      -> IDENT EQ Expr
           | KW_DEF IDENT Lp Params RPAREN COLON Type EQ Expr
           | KW_TRACK IDENT EQ Expr
Lp        -> LPAREN | CALL_LP
Params    -> ε | ParamList
ParamList -> Param | ParamList COMMA Param
Param     -> IDENT COLON Type
Type      -> KW_NOTE | KW_INTERVAL | KW_PHRASE | KW_INT

Expr      -> Par
Par       -> Par AMP Seq | Seq
Seq       -> Seq Item | Item
Item      -> BAR | Post
Post      -> Post PLUS Atom | Post MINUS Atom | Post STAR Atom | Atom
Atom      -> NOTE | NOTE Length | NOTE TIE | NOTE Length TIE
           | REST | REST Length
           | IDENT | IDENT CALL_LP Args RPAREN
           | INT | INTERVAL
           | LPAREN Expr RPAREN
           | LBRACKET Expr RBRACKET Length
Length    -> COLON INT | COLON SLASH INT | COLON INT SLASH INT
Args      -> ε | ArgList
ArgList   -> Expr | ArgList COMMA Expr
```

`ERROR`는 렉서가 내지 않는 가상 터미널이고, 단계 10의 오류 복구에서만 쓴다. 우선순위는 `Par`, `Seq`, `Post`, `Atom`의 계층으로 문법에 이미 들어 있으므로 우선순위 선언이 필요 없다. 후위 연산자의 오른쪽을 `Atom`으로 제한한 것은 SPEC과 같다.

#### 문법 확인 결과

Clef 문법으로 LR(1) 항목 집합을 만든 뒤 core가 같은 상태를 합쳐 LALR 표를 얻은 값이다. 충돌은 (상태, 터미널) 칸 단위로 센다. 상태 수에는 확장 시작 기호 `S' -> Program`의 상태가 들어 있다.

| 문법                    | LR(1) 상태 수 | LALR 상태 수 | 충돌 |
| ----------------------- | ------------- | ------------ | ---- |
| Clef, `error` 생산 없음 | 243           | 95           | 0    |
| Clef, `error` 생산 있음 | 245           | 97           | 0    |

충돌이 없으므로 우선순위 선언 없이 표를 그대로 쓴다. 이 값은 Python 임시 구현의 결과이므로 구현이 맞는지 보는 기준으로 쓴다.

### 파서

파서는 직접 만든 LALR(1) 표와 LR 구동기를 쓴다. 문법은 위 문법 절의 BNF이고, 이 절의 단계 6 ~ 10이 설계와 구현 순서이다.

- `grammar/*`는 Clef를 모르는 범용 코드이다. 문법, FIRST, LR(1) 항목, LALR 표, 표를 읽는 구동기가 들어 있다. `parser/*`가 Clef의 BNF와 오류 진단, reduce 동작을 담는다.
- `Parser`는 생성자에서 `(tokens, bag)`을 받고 `parseAst(): Program`과 `parseTree(): ParseTree`를 낸다. 둘은 같은 구동기에 다른 의미 동작을 넣은 것이다. `parseTree`는 `--emit parse`에만 쓰고 진단은 버린다.
- 구문 트리 타입(CST)과 `AstBuilder`는 없다. 괄호 제거와 연산자 노드 변환은 reduce 동작이 한다(단계 11).
- 호출과 나열의 구분은 `parser/terminals.ts`의 `terminalOf`가 한다.
- 오류 복구는 `Line -> ERROR NEWLINE` 생산과 패닉 모드이다. 헤더 순서(E010)와 닫히지 않은 괄호(E011)는 결정 4, 5를 따른다. `ParseAbort` 예외는 쓰지 않는다.
- 검증 입력은 스펙의 2단계 예시이다.

### 단계 6: 문법 자료구조와 FIRST

#### 목표

파서 생성기의 입력인 문법을 자료구조로 만들고, LR(1) 항목의 lookahead 계산에 쓰는 nullable과 FIRST를 계산한다.

#### 만들 것

```ts
// grammar/grammar.ts
export type Sym = string; // 터미널은 Token의 kind 이름, 논터미널은 첫 글자 대문자

export interface Production {
  readonly id: number;
  readonly lhs: Sym;
  readonly rhs: readonly Sym[];
}

export class Grammar {
  constructor(start: Sym, rules: readonly (readonly [Sym, readonly Sym[]])[]);
  readonly prods: readonly Production[]; // 0번은 확장 생산 S' -> start
  readonly terminals: ReadonlySet<Sym>; // '$' 포함
  readonly nonterminals: ReadonlySet<Sym>;
  prodsOf(lhs: Sym): Production[];
}

// 문법을 "E -> E + T | T" 같은 텍스트로 적고 읽는 도우미. 시험에 쓴다.
export function parseGrammar(text: string): Grammar;
```

```ts
// grammar/first.ts
export function nullable(g: Grammar): Set<Sym>;
export function first(g: Grammar): Map<Sym, Set<Sym>>;
export function firstOfSeq(
  f: Map<Sym, Set<Sym>>,
  n: Set<Sym>,
  seq: readonly Sym[],
): { set: Set<Sym>; nullable: boolean };
```

두 계산 모두 변화가 없을 때까지 반복하는 고정점 계산이다. 수업의 FIRST 규칙을 그대로 옮긴다. FOLLOW는 LALR 표에 필요하지 않으므로 만들지 않는다.

#### 수업 연결

FIRST 계산, 문자열의 FIRST, ε이 되는 논터미널의 처리.

#### 시험

수업 노트의 비좌재귀 식 문법으로 기대값을 확인한다.

```text
E  -> T E'
E' -> + T E' | ε
T  -> F T'
T' -> * F T' | ε
F  -> ( E ) | id
```

|         | FIRST  |
| ------- | ------ |
| E, T, F | `( id` |
| E'      | `+ ε`  |
| T'      | `* ε`  |

Clef 문법을 넣어 FIRST(Item)이 `BAR NOTE REST IDENT INT INTERVAL LPAREN LBRACKET`인지도 본다.

### 단계 7: LR(1) 항목, LALR 표, 충돌 보고

#### 목표

Clef 문법의 LALR(1) 표를 만든다. LR(1) 항목 집합(정규 모음)을 만들고, core가 같은 상태를 합쳐 LALR 표를 얻고, 충돌을 찾아 보고한다. LALR 표를 만드는 데 LR(0) 표나 SLR 표는 필요하지 않으므로 만들지 않는다.

#### 만들 것

```ts
// grammar/lr1.ts
export interface Item {
  readonly prod: number;
  readonly dot: number;
  readonly la: Sym;
} // [A -> α • β, a]
export function closure(g: Grammar, first: FirstSets, items: readonly Item[]): Item[];
export function goto(g: Grammar, first: FirstSets, state: readonly Item[], x: Sym): Item[];
export interface Automaton {
  readonly states: Item[][];
  readonly edges: Map<number, Map<Sym, number>>; // 상태, 기호 -> 상태
}
export function buildLr1(g: Grammar): Automaton; // 정규 모음
```

CLOSURE는 항목 `[A -> α • B β, a]`마다 `B`의 모든 생산 `B -> γ`에 대해 `FIRST(β a)`의 각 터미널 `b`로 `[B -> • γ, b]`를 더한다. 새 항목이 더 이상 생기지 않을 때까지 반복한다. GOTO는 점 뒤의 기호가 `x`인 항목의 점을 한 칸 옮기고 CLOSURE를 취한다. 시작 상태는 `[S' -> • S, $]`의 CLOSURE이다.

```ts
// grammar/lalr.ts
export function mergeCores(a: Automaton): Automaton;
export function buildLalr(g: Grammar): ParseTable; // buildLr1 -> mergeCores -> 표 채우기
```

`mergeCores`는 core(lookahead를 뺀 항목 집합)가 같은 상태를 하나로 합치고, 합친 상태의 항목별 lookahead를 합집합한다. 간선은 합쳐진 번호로 다시 잇는다. LR(1) 상태가 수백 개이므로 항목 집합을 정렬된 문자열 키로 바꿔 `Map`으로 찾으면 충분하다.

```ts
// grammar/table.ts
export type Action =
  | { kind: 'shift'; to: number }
  | { kind: 'reduce'; prod: number }
  | { kind: 'accept' };

export interface Conflict {
  state: number;
  on: Sym;
  kind: 'shift/reduce' | 'reduce/reduce';
  actions: Action[];
}

export interface ParseTable {
  readonly action: Map<Sym, Action>[]; // 상태 -> 터미널 -> 동작
  readonly goto: Map<Sym, number>[]; // 상태 -> 논터미널 -> 상태
  readonly conflicts: Conflict[];
}
```

표를 채우는 규칙은 수업과 같다.

- 터미널 `a`로 가는 간선이 있으면 `action[i][a] = shift`
- 논터미널 `A`로 가는 간선이 있으면 `goto[i][A]`
- `[S' -> S •, $]`가 있으면 `action[i]['$'] = accept`
- `[A -> α •, a]`가 있으면 `action[i][a] = reduce`. lookahead 칸에만 넣는다.
- 칸이 이미 차 있으면 덮어쓰지 말고 `conflicts`에 기록한다. 충돌이 있는 문법을 조용히 한쪽으로 해결하면 문법의 잘못을 숨기게 된다. 충돌이 하나라도 있으면 `buildLalr`는 예외를 던진다.

#### 수업 연결

LR(1) 항목과 lookahead, CLOSURE와 GOTO, 정규 모음. core가 같은 상태를 합치면 상태 수가 줄고, reduce/reduce 충돌이 새로 생길 수 있다는 LALR의 정의.

#### 시험

아래 문법의 LALR 표가 기대한 상태 수와 충돌 수를 내는지 본다. 앞의 세 줄은 충돌이 없어야 하는 문법이고, 넷째 줄은 충돌 보고가 동작하는지 확인하는 문법이다.

| 문법                                                        | 기대 (LALR 상태 수, 충돌)                   |
| ----------------------------------------------------------- | ------------------------------------------- |
| `E -> E + T \| T`, `T -> id`                                | 6, 충돌 없음                                |
| `E -> E + T \| T`, `T -> T * F \| F`, `F -> ( E ) \| id`    | 12, 충돌 없음                               |
| `S -> L = R \| R`, `L -> * R \| id`, `R -> L`               | 10, 충돌 없음                               |
| `S -> a E a \| b E b \| a F b \| b F a`, `E -> e`, `F -> e` | 13, reduce/reduce 2개                       |
| Clef 문법(`error` 생산 없이)                                | 95, 충돌 없음. 합치기 전 LR(1) 상태는 243개 |
| Clef 문법(`error` 생산 있음)                                | 97, 충돌 없음. 합치기 전 LR(1) 상태는 245개 |

### 단계 8: LR 구동기와 파스 트리

#### 목표

표를 읽어 토큰 열을 파스 트리로 바꾼다. 아직 오류 복구는 없고, 오류를 만나면 그 자리에서 멈춘다.

#### 만들 것

```ts
// grammar/lr-driver.ts
export type ParseTree =
  | { kind: 'leaf'; token: Token }
  | { kind: 'node'; prod: Production; children: ParseTree[] };

export interface Semantics<V> {
  // 단계 11에서 AST 동작으로 바꿔 끼운다
  leaf(token: Token): V;
  reduce(prod: Production, children: V[]): V;
}

export function lrParse<V>(
  g: Grammar,
  table: ParseTable,
  tokens: readonly Token[],
  sem: Semantics<V>,
  terminalOf: (tokens: readonly Token[], i: number) => string = (ts, i) => ts[i]!.kind,
): { value: V } | { error: ParseFailure };
```

수업의 LR 구동 알고리즘이다. 스택에는 (상태, 값) 쌍을 쌓는다.

```text
스택 <- [(0, -)], i <- 0
loop:
    s <- 스택 맨 위 상태, a <- terminalOf(tokens, i)
    switch action[s][a]:
        shift t:   스택에 (t, leaf(tokens[i])) 푸시, i++
        reduce p:  rhs 길이만큼 팝해 값을 모으고 sem.reduce(p, 값들)을 계산,
                   팝한 뒤 맨 위 상태 s'와 p.lhs로 goto[s'][p.lhs]를 구해 푸시
        accept:    스택 맨 위 값을 돌려줌
        없음:      오류
```

값을 `V`로 일반화하는 것이 중요하다. 이 단계에서는 `Semantics<ParseTree>`로 파스 트리를 만들고, 단계 11에서 같은 구동기에 AST를 만드는 의미 동작을 넣는다. 수업에서 "S-속성 정의는 LR 파싱 중 reduce 시점에 평가할 수 있다"고 한 내용이 이 구조이다.

#### 시험

수업 노트의 식 문법을 쓴다. `E -> E + T | T`, `T -> T * F | F`, `F -> ( E ) | id` 문법에서 `id * id + id`가 받아들여지고, reduce 순서가 파스 트리의 후위 순회와 같은지 본다. 스택 추적을 문자열로 출력하는 `trace` 옵션을 켜서 수업 노트의 표(스택, 남은 입력, 동작)와 눈으로 비교한다.

### 단계 9: Clef 문법 연결, `--emit parse`

#### 목표

위의 Clef 문법을 입력으로 파서를 완성하고, 렉서와 이어 SPEC의 2단계 출력을 만든다.

#### 만들 것

```ts
// parser/clef-grammar.ts
export const CLEF_GRAMMAR_TEXT = `...`; // 위 BNF 그대로 (이 단계에서는 ERROR 생산을 뺀다)
export const CLEF_GRAMMAR: Grammar = parseGrammar(CLEF_GRAMMAR_TEXT);
export const CLEF_TABLE: ParseTable = buildLalr(CLEF_GRAMMAR); // 모듈 로드 때 한 번 만든다
```

문법의 터미널 이름은 `token.kind`와 같다. 이름이 다르면 표에 없는 터미널로 읽혀 첫 토큰부터 오류가 나므로 이 점을 가장 먼저 확인한다. 예외는 `CALL_LP` 하나이고, `token.kind`에 없는 터미널이다. `parser/terminals.ts`의 `terminalOf(tokens, i)`가 `LPAREN`이고 `spaceBefore`가 `false`이고 직전 토큰이 `IDENT`일 때만 `CALL_LP`를 돌려주고, 그 밖에는 `token.kind`를 그대로 돌려준다. `parser.ts`는 이 함수를 `lrParse`에 넘긴다(결정 2).

`emit/parse.ts`는 SPEC의 파스 트리 형식을 낸다. 규칙은 두 가지이다.

- 자식이 하나인 논터미널 사슬은 `Item -> Post -> Atom -> IDENT m1`처럼 한 줄에 `->`로 잇는다.
- `Stmt`의 이름은 생산에 따라 `TrackStmt`, `AssignStmt`, `DefStmt`로 바꿔 부른다(SPEC 예시가 `TrackStmt`로 시작한다). 이 이름 규칙은 SPEC과 대조해서 확정한다.

#### 이정표 2

SPEC의 2단계 입력 중 오류가 없는 입력의 파스 트리가 SPEC과 글자까지 같다.

```text
track piano = m1 m1+2d
TrackStmt
+- IDENT piano
+- Par
   +- Seq
      +- Item -> Post -> Atom -> IDENT m1
      +- Item -> Post
         +- Post -> Atom -> IDENT m1
         +- PLUS
         +- Atom -> INTERVAL 2d
```

추가로 `canon.clef`, `program-p.clef`, `f(m1) f (m1)`(호출과 나열), `[C4 D4]:1`, `C4:/2 D4:3/2`, `a b & c d`를 파싱해 본다. `f(m1)`은 `IDENT CALL_LP`로, `f (m1)`은 `IDENT LPAREN`로 나뉘어 서로 다른 트리가 나와야 한다. 두 입력의 `--emit tokens` 결과는 `spaceBefore`만 다르고 둘 다 `LPAREN`이다.

### 단계 10: 오류 복구

#### 목표

문장에서 오류가 나도 다음 줄부터 다시 파싱해, 한 번의 실행에서 여러 줄의 오류를 모두 보고한다. 수업의 "파서의 오류 처리" 중 패닉 모드와 오류 생산에 해당한다.

#### 문법 변경

`Line -> ERROR NEWLINE` 생산을 켠다. `ERROR`는 렉서가 내지 않는 터미널이다. 표를 다시 만들면 LALR 상태가 97개가 되고 충돌은 없다(앞의 문법 확인 결과).

#### 구동기 변경

오류를 만나면 yacc 방식으로 복구한다.

```text
오류 발생 (action[s][a]가 없음):
    1. 진단을 보고한다.                                  // 아래 표
    2. 스택에서 상태를 팝하며, ERROR로 shift할 수 있는 상태를 찾는다.
       - 없으면 복구 실패. 파싱을 끝낸다.
    3. ERROR를 shift한다. 이때 쌓인 가상 토큰의 값은 '오류 노드'이다.
    4. 입력에서 NEWLINE이 나올 때까지 토큰을 버린다.     // 동기화 토큰
    5. NEWLINE을 shift하고 reduce Line -> ERROR NEWLINE을 수행한 뒤 정상 구동으로 돌아간다.
```

렉서가 괄호 안의 NEWLINE을 이미 지웠으므로 4번의 "NEWLINE까지 건너뜀"이 SPEC의 "괄호 깊이가 0인 첫 NEWLINE까지"와 같다.

한 오류를 보고한 직후 같은 줄에서 연쇄 오류가 나오지 않도록, 4번에서 버리는 동안에는 보고하지 않는다.

#### 진단 만들기

`parser/errors.ts`에 `describe(state, token, prevToken)`를 둔다. 상태의 `action` 행에 있는 터미널 집합이 "기대한 토큰"이다.

| 상황                                                                                                          | 코드, 메시지                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 오류 토큰이 EOF 앞의 NEWLINE 또는 EOF이고, 토큰 열에 닫히지 않은 괄호가 있음                                  | E011 `unclosed '('` 또는 `unclosed '['`. 위치는 가장 안쪽에서 열린 괄호                                              |
| 기대한 집합에 식의 시작 토큰(`NOTE REST IDENT INT INTERVAL LPAREN LBRACKET BAR`)이 있고 직전 토큰이 `+ - * &` | E010 `expected expression after '+'`, 위치는 문제의 토큰                                                             |
| 기대한 집합에 식의 시작 토큰이 있고 직전 토큰이 연산자가 아님                                                 | E010 `expected expression, found '*'`                                                                                |
| 문제의 토큰이 `PITCHCLASS`                                                                                    | E002 `note 'E' needs an octave (for example E4)`                                                                     |
| 그 밖                                                                                                         | E010 `unexpected '<lexeme>'`                                                                                         |
| 헤더가 문장 뒤에 나옴 (`Line` reduce 시점)                                                                    | E010 `unexpected 'time', headers must come before statements`. 이 경우 구문 오류가 아니므로 복구 없이 그 줄만 버린다 |

이 표의 문구는 SPEC의 2단계 예시에서 가져왔다. 기대한 토큰 집합이 LALR 표의 기본 reduce 때문에 실제보다 넓을 수 있으니, 메시지는 집합의 내용이 아니라 위와 같은 몇 개의 유형으로만 쓴다.

`findUnclosed(tokens)`는 토큰 열을 앞에서부터 훑으며 여는 괄호를 스택에 넣고 닫는 괄호가 나오면 뺀다. 훑은 뒤 스택에 남은 괄호가 닫히지 않은 괄호이다. 렉서는 깊이만 세고 이 스택을 만들지 않으므로, `Lexer.tokenize()`의 반환형은 `Token[]` 그대로이다. 이 함수는 오류가 났을 때만 부른다.

#### 시험

SPEC의 2단계 오류 예시 5개와 다음을 확인한다.

- 오류 두 줄이 있는 입력(`track a = m1 +` 다음 줄 `track b = * 2`)이 두 오류를 모두 보고한다.
- 오류가 난 줄은 AST에서 빠지고, 그 앞뒤 줄은 정상 파싱된다.
- `m1 = (C4 E4`가 `1:6 error[E011]: unclosed '('` 하나만 낸다. `m1 = [C4 (D4`는 가장 안쪽인 `(`의 위치를 가리킨다. `m1 = C4)`는 E011이 아니라 E010이다.
- 파일 끝까지 오류만 있어도 무한 루프에 빠지지 않는다. 임의 문자열 수천 개를 넣어 종료를 확인한다.

### AST

AST 노드는 두 위치를 가진다. `span`은 노드의 가장 왼쪽 토큰이고, `opSpan`은 연산자 토큰이다. 진단이 가리키는 위치는 코드마다 다르며 이 구분이 그 근거이다(뒤의 진단 위치 규칙 참고).

`src/core/ast/ast.ts`

```ts
import type { Rational } from '../common/rational.ts';
import type { Span } from '../common/span.ts';
import type { Accidental, Letter, Mode } from '../music/pitch.ts';

export type TypeName = 'Int' | 'Interval' | 'Note' | 'Phrase';

/**
 * span은 노드의 가장 왼쪽 토큰 위치다.
 * opSpan은 연산자 토큰 위치로, 연산자 오류(E201, E307, W603)가 가리킨다.
 */
export type Expr =
  | {
      readonly kind: 'Note';
      readonly letter: Letter;
      readonly acc: Accidental;
      readonly octave: number;
      readonly length: Rational | null;
      readonly tie: boolean;
      readonly span: Span;
    }
  | { readonly kind: 'Rest'; readonly length: Rational | null; readonly span: Span }
  | { readonly kind: 'Int'; readonly value: number; readonly span: Span }
  | {
      readonly kind: 'Interval';
      readonly size: number;
      readonly unit: 'd' | 'st';
      readonly span: Span;
    }
  | { readonly kind: 'Var'; readonly name: string; readonly span: Span }
  | {
      readonly kind: 'Call';
      readonly name: string;
      readonly args: readonly Expr[];
      readonly span: Span;
    }
  | { readonly kind: 'Seq'; readonly items: readonly Expr[]; readonly span: Span }
  | {
      readonly kind: 'Par';
      readonly left: Expr;
      readonly right: Expr;
      readonly opSpan: Span;
      readonly span: Span;
    }
  | {
      readonly kind: 'Transpose';
      readonly operand: Expr;
      readonly sign: 1 | -1;
      readonly amount: Expr;
      readonly opSpan: Span;
      readonly span: Span;
      readonly firstStep?: { readonly sign: 1 | -1; readonly size: number };
    }
  | {
      readonly kind: 'Repeat';
      readonly operand: Expr;
      readonly count: Expr;
      readonly opSpan: Span;
      readonly span: Span;
    }
  | {
      readonly kind: 'Group';
      readonly items: readonly Expr[];
      readonly length: Rational;
      readonly span: Span;
    }
  | { readonly kind: 'Bar'; readonly span: Span };

export type ExprKind = Expr['kind'];

export interface Param {
  readonly name: string;
  readonly type: TypeName;
  readonly span: Span;
}

export type HeaderDecl =
  | { readonly kind: 'time'; readonly num: number; readonly den: number; readonly span: Span }
  | {
      readonly kind: 'key';
      readonly letter: Letter;
      readonly acc: Accidental;
      readonly mode: Mode;
      readonly span: Span;
    }
  | { readonly kind: 'tempo'; readonly bpm: number; readonly span: Span }
  | { readonly kind: 'unit'; readonly num: number; readonly den: number; readonly span: Span };

export type Stmt =
  | { readonly kind: 'Assign'; readonly name: string; readonly nameSpan: Span; readonly body: Expr }
  | {
      readonly kind: 'Def';
      readonly name: string;
      readonly nameSpan: Span;
      readonly params: readonly Param[];
      readonly ret: TypeName;
      readonly retSpan: Span;
      readonly body: Expr;
    }
  | {
      readonly kind: 'Track';
      readonly instrument: string;
      readonly instrumentSpan: Span;
      readonly body: Expr;
    };

export interface Program {
  readonly headers: readonly HeaderDecl[];
  readonly stmts: readonly Stmt[];
}

/** 모든 하위 식에 f를 적용해 같은 종류의 노드를 다시 만든다. 최적화 단계가 공통으로 쓴다. */
export function mapChildren(e: Expr, f: (child: Expr) => Expr): Expr {
  switch (e.kind) {
    case 'Note':
    case 'Rest':
    case 'Int':
    case 'Interval':
    case 'Var':
    case 'Bar':
      return e;
    case 'Call':
      return { ...e, args: e.args.map(f) };
    case 'Seq':
      return { ...e, items: e.items.map(f) };
    case 'Group':
      return { ...e, items: e.items.map(f) };
    case 'Par':
      return { ...e, left: f(e.left), right: f(e.right) };
    case 'Transpose':
      return { ...e, operand: f(e.operand), amount: f(e.amount) };
    case 'Repeat':
      return { ...e, operand: f(e.operand), count: f(e.count) };
  }
}
```

`mapChildren`은 모든 하위 식에 함수를 적용해 같은 종류의 노드를 다시 만든다. 인라이닝과 이조 접기가 이 함수 하나로 트리를 순회하므로 노드 종류가 늘어도 순회 코드는 한 곳만 고치면 된다.

AST는 파서의 reduce 동작(`parser/actions.ts`)이 생산마다 바로 만든다. 변환 규칙은 다음과 같다.

| 생산                                                | AST                                           |
| --------------------------------------------------- | --------------------------------------------- |
| `Atom -> LPAREN Expr RPAREN`                        | 안의 식 (괄호 제거, 나열은 평탄화하지 않는다) |
| `Atom -> IDENT`                                     | `Var`                                         |
| `Par -> Par AMP Seq`                                | `Par`                                         |
| `Post -> Post PLUS Atom`, `Post -> Post MINUS Atom` | `Transpose` (`sign`이 1 또는 -1)              |
| `Post -> Post STAR Atom`                            | `Repeat`                                      |
| 헤더 생산 4종                                       | `HeaderDecl` 목록                             |

나열을 평탄화하지 않는 이유는 마디선 검사가 나열 단위로 지역적이기 때문이다. `(a | b) c`를 `a | b c`로 펴면 검사 구간이 달라진다.

### 단계 11: SDT로 AST 생성

#### 목표

단계 8의 `Semantics<V>`에 AST를 만드는 의미 동작을 넣는다. 파스 트리를 만든 뒤 변환하는 `AstBuilder` 대신, reduce가 일어날 때 노드를 바로 만든다. 수업의 "AST 생성 SDT"이다.

#### 먼저 만들 것

이 단계부터 길이를 분수로 다루므로 이 문서의 `common/rational.ts`(BigInt 분수)와 `music/pitch.ts`(`midiOf`, `pitchName`, `scaleOf`, `diatonicShift`)를 이 단계에서 만든다. `ast/ast.ts`는 위 AST 절의 정의를 따른다.

#### 의미 동작

`parser/actions.ts`에 생산마다 하나의 동작을 둔다. 모든 값이 자식에서 부모로만 흐르므로 S-속성 정의이다.

| 생산                                                       | 동작                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Lines -> Lines Line`                                      | 목록에 `Line`의 값을 추가. 오류 노드면 추가하지 않는다                      |
| `Line -> Header NEWLINE`, `Line -> Stmt NEWLINE`           | 값을 그대로 올린다. 헤더가 문장 뒤에 나오면 E010을 보고하고 값을 버린다     |
| `Program -> Lines`                                         | `Program(headers, stmts)`를 만든다                                          |
| `Stmt -> IDENT EQ Expr`                                    | `Assign(name, expr)`                                                        |
| `Stmt -> KW_TRACK IDENT EQ Expr`                           | `Track(instrument, expr)`                                                   |
| `Stmt -> KW_DEF IDENT Lp Params RPAREN COLON Type EQ Expr` | `Def(name, params, ret, body)`                                              |
| `Par -> Par AMP Seq`                                       | `Par(left, right)`                                                          |
| `Par -> Seq`                                               | 항목이 하나뿐이면 그 항목, 아니면 `Seq`                                     |
| `Seq -> Seq Item`                                          | 항목 목록에 추가(평탄한 `Seq`)                                              |
| `Seq -> Item`                                              | 항목이 하나인 목록                                                          |
| `Post -> Post PLUS Atom`                                   | `Transpose(+1, operand, amount, opSpan)`. `opSpan`은 `PLUS`의 위치          |
| `Post -> Post MINUS Atom`                                  | `Transpose(-1, ...)`                                                        |
| `Post -> Post STAR Atom`                                   | `Repeat(operand, count, opSpan)`                                            |
| `Atom -> NOTE Length TIE`                                  | `Note(pitch, length, tie)`. 길이가 없으면 `unit` 한 개를 뜻하는 값을 넣는다 |
| `Atom -> LPAREN Expr RPAREN`                               | `Expr`의 값 그대로(괄호 제거). 안쪽 `Seq`는 평탄화하지 않는다               |
| `Atom -> LBRACKET Expr RBRACKET Length`                    | `Group(expr, length)`                                                       |
| `Atom -> IDENT CALL_LP Args RPAREN`                        | `Call(name, args)`                                                          |
| `Length -> COLON INT SLASH INT`                            | `Rational`로 만든 `m/n`. 길이는 `unit`의 배수로 해석한다                    |

이 표의 값들이 SPEC의 3단계 예시(`Seq[Var(m1), Transpose(Var(m1), +2d)]`, `Group(Seq[...], 1)`, `Repeat(Transpose(Var(a), +2d), 2)`)와 일치하는지 확인한다.

`parser/parser.ts`의 `Parser.parseProgram()`은 이제 이렇게 두 번 구동기를 부른다. 한 번은 `ParseTree` 의미 동작으로 `--emit parse`용 트리를, 한 번은 AST 의미 동작으로 AST를 만든다. 입력 토큰이 같고 구동이 빠르므로 두 번 돌려도 비용은 문제가 없다. 파서에 오류가 있었으면 AST 단계는 돌리지 않는다.

#### 시험

SPEC의 3단계 입력 6개의 `--emit ast` 출력이 SPEC과 같고, 오류가 있는 줄은 빠진다. 헤더 값 검사(박자표 분모가 2의 거듭제곱인지, 0이 아닌지)는 `Header` 동작에서 한다. 오류 코드는 SPEC과 대조해 정한다.

### 검사기

`Checker`는 4단계이다. 하는 일은 순서대로 다음과 같다.

1. 헤더를 확정한다. 기본값은 4/4, C 장조, 템포 120, 단위 1/4이다. 같은 헤더가 두 번 나오면 E102이다.
2. 함수를 모두 먼저 등록한다. 함수는 선언 위치와 무관하게 호출할 수 있다. 이름 충돌은 E103이다.
3. 문장을 순서대로 검사한다. 변수는 선언 뒤에서만 쓸 수 있고 함수는 어디서든 호출한다. 본문의 타입은 `typeOf`가 계산한다.
4. 호출 그래프에서 순환을 찾고(E401), 쓰이지 않은 정의(W601)와 트랙이 없음(W602)을 경고한다.

타입은 `Int`, `Interval`, `Note`, `Phrase`이고 `Note`는 `Phrase`의 부분 타입이다. 오류가 난 식의 타입은 `Error`이며 `Error`는 어떤 타입으로도 받아들여져 같은 원인의 오류가 연쇄해서 나오지 않는다.

| 식               | 타입 규칙                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| 음표             | `Note`                                                                                              |
| 쉼표, 마디선     | `Phrase`                                                                                            |
| 나열, 묶음       | 모든 항목이 `Note` 또는 `Phrase`이면 `Phrase`, 아니면 항목 위치에 E201                              |
| `a & b`          | 둘 다 `Note` 또는 `Phrase`이면 `Phrase`, 아니면 연산자 위치에 E201                                  |
| `a + i`, `a - i` | `a`가 `Note` 또는 `Phrase`이고 `i`가 `Interval`이면 `a`의 타입, 아니면 E201                         |
| `a * n`          | `a`가 `Note` 또는 `Phrase`이고 `n`이 `Int`이면 `Phrase`, 아니면 E201                                |
| `f(args)`        | 인수 개수가 다르면 E203, 인수 타입이 대입 가능하지 않으면 인수 위치에 E203, 결과는 선언된 반환 타입 |

`src/core/check/checker.ts` 179~230행

```ts
  typeOf(e: Expr): Type {
    switch (e.kind) {
      case 'Note': return 'Note';
      case 'Rest': return 'Phrase';
      case 'Bar': return 'Phrase';
      case 'Int': return 'Int';
      case 'Interval': return 'Interval';
      case 'Var': return this.typeOfVar(e);
      case 'Call': return this.typeOfCall(e);
      case 'Seq':
      case 'Group': {
        for (const item of e.items) {
          const t = this.typeOf(item);
          if (t !== 'Error' && !isPhraseLike(t)) {
            this.diags.error('E201', item.span, `sequence items must be Note or Phrase, found ${t}`);
          }
        }
        return 'Phrase';
      }
      case 'Par': {
        const l = this.typeOf(e.left);
        const r = this.typeOf(e.right);
        if ((l !== 'Error' && !isPhraseLike(l)) || (r !== 'Error' && !isPhraseLike(r))) {
          this.diags.error('E201', e.opSpan, `operator '&' is not defined for (${l}, ${r})`, 'expected (Note & Note), (Note & Phrase), (Phrase & Note) or (Phrase & Phrase)');
          return 'Error';
        }
        return 'Phrase';
      }
      case 'Transpose': {
        const l = this.typeOf(e.operand);
        const r = this.typeOf(e.amount);
        const op = e.sign === 1 ? '+' : '-';
        if (l === 'Error' || r === 'Error') return 'Error';
        if (!isPhraseLike(l) || r !== 'Interval') {
          this.diags.error('E201', e.opSpan, `operator '${op}' is not defined for (${l}, ${r})`, `expected (Note ${op} Interval) or (Phrase ${op} Interval)`);
          return 'Error';
        }
        return l;
      }
      case 'Repeat': {
        const l = this.typeOf(e.operand);
        const r = this.typeOf(e.count);
        if (l === 'Error' || r === 'Error') return 'Error';
        if (!isPhraseLike(l) || r !== 'Int') {
          this.diags.error('E201', e.opSpan, `operator '*' is not defined for (${l}, ${r})`, 'expected (Note * Int) or (Phrase * Int)');
          return 'Error';
        }
        return 'Phrase';
      }
    }
  }
```

호출 그래프 순환은 깊이 우선 탐색이다. 방문 중인 함수로 되돌아오는 간선을 만나면 그 호출 위치에 E401을 보고한다. 메시지의 경로(`a -> b -> a`)는 탐색 경로에서 순환 구간만 잘라 만든다.

`src/core/check/checker.ts` 277~295행

```ts
  /** 호출 그래프를 깊이 우선으로 훑어 되돌아오는 간선을 찾는다. */
  private detectRecursion(): void {
    const state = new Map<string, 'visiting' | 'done'>();
    const path: string[] = [];
    const visit = (fn: string): void => {
      state.set(fn, 'visiting');
      path.push(fn);
      for (const edge of this.edges.get(fn) ?? []) {
        const s = state.get(edge.callee);
        if (s === 'visiting') {
          const cycle = [...path.slice(path.indexOf(edge.callee)), edge.callee];
          this.diags.error('E401', edge.span, `function '${edge.callee}' is recursive (${cycle.join(' -> ')})`);
        } else if (s === undefined) visit(edge.callee);
      }
      path.pop();
      state.set(fn, 'done');
    };
    for (const name of this.funcs.keys()) if (!state.has(name)) visit(name);
  }
```

"혹시 이 이름이었나요"는 편집 거리 2 이하인 후보 중 가장 가까운 것 하나를 `help`로 붙인다. 이름(E101)과 악기(E104)에 모두 쓴다.

`src/core/check/checker.ts` 34~61행

```ts
export function didYouMean(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDist = 3;
  for (const c of candidates) {
    const d = editDistance(name, c);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) (dp[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      (dp[i] as number[])[j] = Math.min(
        (dp[i - 1] as number[])[j]! + 1,
        (dp[i] as number[])[j - 1]! + 1,
        (dp[i - 1] as number[])[j - 1]! + cost,
      );
    }
  }
  return (dp[a.length] as number[])[b.length] as number;
}
```

### 단계 12: 검사기와 심볼 테이블

위 검사기 절의 설계를 따르되, 수업의 속성 문법 관점으로 읽으면 구조가 설명된다.

| 수업 개념        | Clef의 검사기                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------- |
| 합성 속성 `type` | `typeOf(expr)`가 하위 식의 타입에서 식의 타입을 계산한다                                 |
| 상속 속성 `env`  | 심볼 테이블(변수, 함수)이 위에서 아래로 전달된다. 함수 본문은 매개변수 환경으로 검사한다 |
| 심볼 테이블      | `Map<name, {type, span, used}>`와 함수 표. 선언 순서에 따라 변수 가시성을 정한다         |
| 오류 타입        | `Error`는 어떤 타입으로도 받아들여져 연쇄 오류를 막는다                                  |

만드는 순서는 다음과 같다.

1. 헤더 확정(E102), 함수 등록과 이름 충돌(E103)
2. `typeOf`: 연산자 타입 규칙(E201), 변수(E101, 편집 거리 2 이하의 후보 제안), 호출(E203), 정의 본문(E204)
3. 트랙의 악기 이름(E104)
4. 호출 그래프의 깊이 우선 탐색으로 순환 찾기(E401)
5. 경고 W601, W602

완료 기준은 SPEC의 4단계 입력과 기대 출력이 모두 맞는 것이다. 연산자 타입 규칙은 `ts-pattern`의 `match([left, right])`로 표처럼 쓰면 읽기 쉽다.

### 평가기

평가기는 AST를 값으로 계산해 HIR을 만든다. 값은 세 가지이다. 정수, 음정(크기와 종류), 구절(이벤트 목록과 길이)이다. 이벤트의 시작 시각은 구절 안에서의 상대 시각이고, 나열이 이를 이어 붙이며 절대 시각으로 만든다.

`src/core/eval/hir.ts`

```ts
import type { Span } from '../common/span.ts';
import type { Rational } from '../common/rational.ts';
import type { Mode } from '../music/pitch.ts';

export interface Header {
  readonly timeNum: number;
  readonly timeDen: number;
  readonly keyPc: number;
  readonly keyName: string;
  readonly mode: Mode;
  readonly tempo: number;
  /** 길이 접미사 :n의 기준 단위. 온음표 = 1이므로 기본값은 1/4이다. */
  readonly unit: Rational;
}

export interface HirNote {
  readonly kind: 'note';
  readonly start: Rational;
  readonly dur: Rational;
  readonly pitch: number;
  /** 같은 음높이의 다음 음과 이어진다는 표시. */
  readonly tie: boolean;
  readonly span: Span;
}

export interface HirRest {
  readonly kind: 'rest';
  readonly start: Rational;
  readonly dur: Rational;
  readonly span: Span;
}

export type HirEvent = HirNote | HirRest;

export interface HirTrack {
  readonly name: string;
  readonly instrument: string;
  readonly channel: number;
  readonly events: readonly HirEvent[];
}

export interface HirProgram {
  readonly header: Header;
  readonly tracks: readonly HirTrack[];
}

/** 같은 시작 시각이면 쉼표가 먼저, 그다음 음높이 오름차순. */
export function compareEvents(a: HirEvent, b: HirEvent): number {
  const c = a.start.cmp(b.start);
  if (c !== 0) return c;
  if (a.kind !== b.kind) return a.kind === 'rest' ? -1 : 1;
  if (a.kind === 'note' && b.kind === 'note') return a.pitch - b.pitch;
  return 0;
}
```

`src/core/eval/evaluator.ts` 13~53행

```ts
interface PhraseValue {
  readonly kind: 'phrase';
  readonly events: readonly HirEvent[];
  readonly length: Rational;
}
interface IntValue {
  readonly kind: 'int';
  readonly value: number;
}
interface IntervalValue {
  readonly kind: 'interval';
  readonly size: number;
  readonly unit: 'd' | 'st';
}
type Value = PhraseValue | IntValue | IntervalValue;

/** 이 문장의 평가를 중단한다. 진단은 던지기 전에 이미 보고했다. */
class EvalAbort extends Error {}

/** 오류가 난 이름. 이후에 이 이름을 쓰는 문장은 조용히 중단한다. */
const POISON = Symbol('poison');

class Env {
  private readonly vars = new Map<string, Value | typeof POISON>();
  constructor(private readonly parent?: Env) {}
  set(name: string, v: Value | typeof POISON): void {
    this.vars.set(name, v);
  }
  get(name: string): Value | typeof POISON | undefined {
    return this.vars.get(name) ?? this.parent?.get(name);
  }
}

const shift = (e: HirEvent, by: Rational): HirEvent => ({ ...e, start: e.start.add(by) });

/** 길이를 박자표 분모 기준으로 쓴다. 3/4박자에서 3/4 온음표는 "3/4". 나누어떨어지지 않으면 분수 그대로. */
export function formatLength(r: Rational, timeDen: number): string {
  const k = r.mul(Rational.of(timeDen));
  return k.den === 1n ? `${k.num}/${timeDen}` : r.toString();
}
```

평가 규칙은 다음과 같다.

- 대입 문장은 선언 순서대로 평가하고 값을 환경에 넣는다. 함수 정의는 호출될 때만 평가하므로 쓰이지 않은 함수 본문의 오류는 나오지 않는다.
- 문장 하나에서 오류가 나면 `EvalAbort`로 그 문장을 포기하고, 대입이면 이름을 `POISON`으로 표시한다. 이후 그 이름을 쓰는 문장은 조용히 포기하므로 같은 원인의 오류가 연쇄하지 않는다.
- 함수 호출은 새 환경(부모는 전역)에서 본문을 평가한다. 재귀는 검사기가 이미 막았으므로 깊이 제한(64)은 내부 안전장치이다.
- 길이는 `음표 길이 배수 * unit`이다. 기본 `unit`이 1/4이므로 `C4:4`는 온음표 하나이다. 틱으로 정확히 나누어떨어지지 않으면 E302이다.
- 진단과 로그의 길이는 박자표 분모를 기준으로 쓴다(`formatLength`). 4/4에서 온음표는 `4/4`, 3/4박자의 한 마디는 `3/4`이다. 나누어떨어지지 않으면 `1/28`처럼 분수 그대로 쓴다.

나열은 마디선 검사를 함께 한다. 마디선과 마디선 사이(또는 나열의 시작과 첫 마디선 사이)의 길이가 박자표의 한 마디와 다르면 닫는 마디선 위치에 E301을 보고한다. 길이가 0인 구간(맨 앞의 마디선)은 검사하지 않고, 마지막 마디선 뒤의 꼬리는 마디선 검사 대상이 아니다. 이 검사는 나열 하나 안에서 지역적이다.

묶음 `[a b c]:L`은 안쪽 길이 합 T를 L단위(`L * unit`)로 맞추도록 모든 시작 시각과 길이에 `L * unit / T`를 곱한다. 마디선은 묶음 안에서 E306이다. 곱한 뒤 틱으로 나누어떨어지지 않는 이벤트가 있으면 묶음 위치에 E302를 한 번 보고한다.

`src/core/eval/evaluator.ts` 158~200행

```ts
  private evalSeq(items: readonly Expr[], env: Env, checkBars: boolean, onBar?: (span: Span) => void): PhraseValue {
    const events: HirEvent[] = [];
    let cursor = Rational.ZERO;
    let segStart = Rational.ZERO;
    for (const item of items) {
      if (item.kind === 'Bar') {
        if (!checkBars) {
          onBar?.(item.span);
          continue;
        }
        const len = cursor.sub(segStart);
        if (!len.isZero() && !len.equals(this.measure)) {
          const diff = len.cmp(this.measure) < 0 ? this.measure.sub(len) : len.sub(this.measure);
          const note = len.cmp(this.measure) < 0 ? `missing ${this.len(diff)}` : `${this.len(diff)} too long`;
          this.diags.error('E301', item.span, `measure has length ${this.len(len)}, expected ${this.len(this.measure)} (${note})`);
        }
        segStart = cursor;
        continue;
      }
      const v = this.asPhrase(this.eval(item, env));
      for (const ev of v.events) events.push(shift(ev, cursor));
      cursor = cursor.add(v.length);
    }
    return { kind: 'phrase', events, length: cursor };
  }

  /** [a b c]:L. 안쪽 길이의 합이 L단위가 되도록 모든 시간을 같은 비율로 줄이거나 늘린다. */
  private evalGroup(e: Extract<Expr, { kind: 'Group' }>, env: Env): PhraseValue {
    const inner = this.evalSeq(e.items, env, false, (barSpan) => {
      this.diags.error('E306', barSpan, 'bar lines are not allowed inside a group');
    });
    const target = e.length.mul(this.header.unit);
    const scale = target.div(inner.length);
    const events = inner.events.map((ev) => ({ ...ev, start: ev.start.mul(scale), dur: ev.dur.mul(scale) }));
    for (const ev of events) {
      const bad = ev.dur.toTicks(TICKS_PER_WHOLE) === null ? ev.dur : ev.start.toTicks(TICKS_PER_WHOLE) === null ? ev.start : null;
      if (bad !== null) {
        this.diags.error('E302', e.span, `note length ${bad} is not representable at 480 ticks per quarter note`);
        break;
      }
    }
    return { kind: 'phrase', events, length: target };
  }
```

이조는 종류에 따라 달라진다. 반음(`st`)은 MIDI 번호에 더하기만 한다. 온음계(`d`)는 `diatonicShift`를 호출하고, 음계 밖의 음이면 연산자 위치에 E307을 보고한 뒤 이 문장의 평가를 멈춘다. 첫 오류에서 멈추는 이유는 접힌 이조와 접히지 않은 이조가 같은 진단을 내게 하기 위해서이다.

`src/core/eval/evaluator.ts` 215~253행

```ts
  private evalTranspose(e: Extract<Expr, { kind: 'Transpose' }>, env: Env): PhraseValue {
    const p = this.asPhrase(this.eval(e.operand, env));
    const amt = this.eval(e.amount, env);
    if (amt.kind !== 'interval') throw new Error('internal error: checker let a non-interval through');
    const n = e.sign * amt.size;
    const first = e.firstStep ?? { sign: e.sign, size: amt.size };
    const events = p.events.map((ev): HirEvent => {
      if (ev.kind === 'rest') return ev;
      if (amt.unit === 'st') return { ...ev, pitch: ev.pitch + n };
      const moved = diatonicShift(ev.pitch, n, this.header.keyPc, scaleOf(this.header.mode));
      if (moved === null) {
        // 첫 오류에서 이 문장의 평가를 멈춘다. 접힌 이조와 접히지 않은 이조가 같은 진단을 내게 한다.
        this.diags.error(
          'E307', e.opSpan,
          `pitch ${pitchName(ev.pitch)} is not in the ${this.header.keyName} ${this.header.mode} scale (use ${first.sign === 1 ? '+' : '-'}${first.size}st instead)`,
        );
        throw new EvalAbort();
      }
      return { ...ev, pitch: moved };
    });
    return { kind: 'phrase', events, length: p.length };
  }

  private evalRepeat(e: Extract<Expr, { kind: 'Repeat' }>, env: Env): PhraseValue {
    const p = this.asPhrase(this.eval(e.operand, env));
    const c = this.eval(e.count, env);
    if (c.kind !== 'int') throw new Error('internal error: checker let a non-int through');
    if (c.value < 1) {
      this.diags.error('E402', e.count.span, `repeat count must be an integer of at least 1, found ${c.value}`);
      throw new EvalAbort();
    }
    this.guard(p.events.length * c.value, e.span);
    const events: HirEvent[] = [];
    for (let i = 0; i < c.value; i++) {
      const offset = p.length.mul(Rational.of(i));
      for (const ev of p.events) events.push(shift(ev, offset));
    }
    return { kind: 'phrase', events, length: p.length.mul(Rational.of(c.value)) };
  }
```

반복은 횟수가 1 이상이어야 하고(E402는 횟수 토큰 위치), 전개 뒤 이벤트가 100,000개를 넘으면 E403이다. 전개하기 전에 `이벤트 수 * 횟수`로 먼저 검사하므로 메모리를 쓰기 전에 멈춘다. 병렬은 두 구절의 이벤트를 합치고 길이는 큰 쪽을 쓰며, 길이가 다르면 `&` 위치에 W603을 낸다.

트랙은 구절을 평가한 뒤 아래를 순서대로 검사하고 HIR 트랙으로 담는다.

1. 15개를 넘으면 E305(16번째 트랙의 악기 이름 위치)
2. 이벤트를 `compareEvents`로 정렬
3. 길이가 한 마디의 배수가 아니면 E301(본문 시작 위치)
4. 악기 음역을 벗어난 음마다 E303
5. `resolveTies`가 돌려주는 `dangling`마다 E304

`src/core/eval/evaluator.ts` 87~122행

```ts
  private evalTrack(s: Extract<Stmt, { kind: 'Track' }>, out: HirTrack[]): void {
    const channel = Instrument.channelFor(out.length);
    if (channel === undefined) {
      this.diags.error('E305', s.instrumentSpan, 'too many tracks (at most 15)');
      throw new EvalAbort();
    }
    const phrase = this.asPhrase(this.eval(s.body, this.globals));
    const events = [...phrase.events].sort(compareEvents);

    if (!phrase.length.div(this.measure).isInteger()) {
      this.diags.error(
        'E301', s.body.span,
        `track '${s.instrument}' has length ${this.len(phrase.length)}, which is not a multiple of the measure length ${this.len(this.measure)}`,
      );
    }
    const inst = Instrument.find(s.instrument);
    if (inst !== undefined) {
      for (const e of events) {
        if (e.kind === 'note' && !inst.inRange(e.pitch)) {
          this.diags.error(
            'E303', e.span,
            `pitch ${pitchName(e.pitch)} (${e.pitch}) is outside the range of ${inst.name} (${pitchName(inst.low)} to ${pitchName(inst.high)})`,
          );
        }
      }
    }
    for (const d of resolveTies(events).dangling) {
      const next = nextNoteAfter(events, d);
      this.diags.error(
        'E304', d.span,
        `tie from ${pitchName(d.pitch)} has no matching note (${next ? `the next note is ${pitchName(next.pitch)}` : 'there is no next note'})`,
      );
    }
    out.push({ name: s.instrument, instrument: s.instrument, channel, events });
  }
```

### 붙임줄 처리

검사(E304)와 병합이 같은 규칙을 쓰도록 한 함수가 둘을 함께 돌려준다. 이벤트를 시작 시각순으로 훑으며, 붙임줄 표시가 있는 음은 "끝 시각과 음높이"를 키로 대기 표에 넣는다. 다음 음이 그 키와 시작 시각, 음높이가 같으면 앞 음의 길이에 더해 하나로 합치고 붙임줄 표시를 이어받는다. 훑기가 끝났을 때 대기 표에 남은 음이 이어질 상대를 찾지 못한 음이다.

`src/core/eval/ties.ts`

```ts
import { compareEvents, type HirEvent, type HirNote } from './hir.ts';

interface MutableNote {
  kind: 'note';
  start: HirNote['start'];
  dur: HirNote['dur'];
  pitch: number;
  tie: boolean;
  span: HirNote['span'];
}

export interface TieResolution {
  /** 이어진 음을 하나로 합친 이벤트 목록. 시간순이다. */
  readonly merged: readonly HirEvent[];
  /** 이어질 상대를 찾지 못한 음. E304의 대상이다. */
  readonly dangling: readonly HirNote[];
}

const keyOf = (end: { toString(): string }, pitch: number): string => `${end.toString()}|${pitch}`;

/**
 * 같은 음높이이고 시작 시각이 앞 음의 끝과 같은 음을 이어 붙인다.
 * 검사(E304)와 병합이 같은 규칙을 쓰도록 한 함수에서 둘 다 돌려준다.
 */
export function resolveTies(events: readonly HirEvent[]): TieResolution {
  const sorted = [...events].sort(compareEvents);
  const out: (HirEvent | MutableNote)[] = [];
  const pending = new Map<string, MutableNote>();

  for (const ev of sorted) {
    if (ev.kind === 'rest') {
      out.push(ev);
      continue;
    }
    const key = keyOf(ev.start, ev.pitch);
    const head = pending.get(key);
    if (head !== undefined) {
      pending.delete(key);
      head.dur = head.dur.add(ev.dur);
      head.tie = ev.tie;
      if (head.tie) pending.set(keyOf(head.start.add(head.dur), head.pitch), head);
    } else {
      const note: MutableNote = { ...ev };
      out.push(note);
      if (note.tie) pending.set(keyOf(note.start.add(note.dur), note.pitch), note);
    }
  }
  return { merged: out as HirEvent[], dangling: [...pending.values()] };
}

/** E304 메시지에 쓸 "다음 음"을 찾는다. 없으면 undefined. */
export function nextNoteAfter(events: readonly HirEvent[], tied: HirNote): HirNote | undefined {
  const end = tied.start.add(tied.dur);
  return [...events]
    .sort(compareEvents)
    .find((e): e is HirNote => e.kind === 'note' && e.start.cmp(end) >= 0);
}
```

검증한 경우는 다음과 같다.

| 이벤트        | 결과                                   |
| ------------- | -------------------------------------- |
| `C4~ C4 E4:2` | 병합 2개, 첫 음 길이 1/2, 남은 음 없음 |
| `C4~ C4~ C4`  | 병합 1개, 길이 3/4                     |
| `C4~ D4 E4:2` | 남은 음 1개(C4), 다음 음 `D4`          |

### 단계 13: 평가기와 HIR

위 평가기 절의 설계를 따른다. 마찬가지로 수업의 속성 문법으로 설명할 수 있다.

| 수업 개념           | Clef의 평가기                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 합성 속성           | 식의 `events`(이벤트 목록)와 `length`(길이)                                                                                                         |
| 상속 속성           | 나열 안에서 각 항목의 시작 시각. 왼쪽 항목의 길이가 오른쪽 항목의 시작 시각이 되므로, 값이 형제 사이를 왼쪽에서 오른쪽으로만 흐르는 L-속성 정의이다 |
| 의미 동작 실행 순서 | 이름의 값은 선언 순서대로 계산한다. 의존 그래프가 순환하지 않는다는 것을 단계 12의 변수 가시성 규칙이 보장한다                                      |

만드는 순서는 평가기 절과 같다. `resolveTies`와 `formatLength` 같은 순수 함수를 먼저 만들고 단위 테스트를 통과시킨 뒤, `evalSeq`, `evalGroup`, `evalPar`, `evalTranspose`, `evalRepeat`, `evalCall`, `evalTrack` 순으로 간다. 오류는 문장 단위로 끊고, 오류가 난 이름은 이후에 조용히 건너뛴다.

#### 이정표 3

SPEC의 6단계 입력과 기대 출력이 모두 맞는다. 프로그램 P의 `--emit hir` 출력이 SPEC과 같다.

### 최적화

최적화는 `Pass<T>` 하나로 통일한다. `-O0`은 `mandatory`인 단계만 돌린다. 붙임줄 병합은 출력 의미를 만들기 때문에 `mandatory`이고, 그 결과 `-O0`과 기본 옵션의 LIR이 같다.

`src/core/opt/pass.ts`

```ts
/** 같은 자료구조를 받아 같은 자료구조를 돌려주는 최적화 단계. */
export interface Pass<T> {
  readonly name: string;
  /** true이면 -O0에서도 실행한다. 출력의 의미가 이 단계에 달려 있다. */
  readonly mandatory: boolean;
  run(input: T): T;
}

export type OptLevel = 0 | 1;

export class PassPipeline<T> {
  constructor(private readonly passes: readonly Pass<T>[]) {}

  run(input: T, level: OptLevel): T {
    return this.passes
      .filter((p) => level > 0 || p.mandatory)
      .reduce((acc, p) => p.run(acc), input);
  }
}
```

**인라이닝**은 호출을 본문으로 바꾼다. 본문의 매개변수를 인수 식으로 치환하고 본문 안의 다른 호출은 먼저 펴 둔다. 매개변수 하나라도 본문에서 쓰이지 않으면 인라이닝하지 않는다. 쓰이지 않는 매개변수의 인수에 오류가 있으면 인라이닝 후에 그 오류가 사라져 `-O0`과 진단이 달라지기 때문이다. 펴진 본문의 노드는 본문의 위치(`span`)를 그대로 가지므로 오류 위치는 `-O0`과 같다.

`src/core/opt/ast/inline.ts`

```ts
import { mapChildren, type Expr, type Program, type Stmt } from '../../ast/ast.ts';
import type { Pass } from '../pass.ts';

type DefStmt = Extract<Stmt, { kind: 'Def' }>;

const countUses = (e: Expr, name: string): number =>
  (e.kind === 'Var' && e.name === name ? 1 : 0) +
  childrenOf(e).reduce((n, c) => n + countUses(c, name), 0);

function childrenOf(e: Expr): readonly Expr[] {
  const acc: Expr[] = [];
  mapChildren(e, (c) => (acc.push(c), c));
  return acc;
}

/** 함수 호출을 본문으로 바꾼다. 인수를 쓰지 않는 매개변수가 있으면 인수의 오류가 사라지므로 인라이닝하지 않는다. */
export class InlinePass implements Pass<Program> {
  readonly name = 'inline';
  readonly mandatory = false;

  run(program: Program): Program {
    const defs = new Map<string, DefStmt>();
    for (const s of program.stmts) if (s.kind === 'Def') defs.set(s.name, s);

    const inlined = new Map<string, Expr>();
    const bodyOf = (d: DefStmt): Expr => {
      let b = inlined.get(d.name);
      if (b === undefined) {
        b = walk(d.body);
        inlined.set(d.name, b);
      }
      return b;
    };

    const substitute = (e: Expr, env: ReadonlyMap<string, Expr>): Expr =>
      e.kind === 'Var' ? (env.get(e.name) ?? e) : mapChildren(e, (c) => substitute(c, env));

    const walk = (e: Expr): Expr => {
      const m = mapChildren(e, walk);
      if (m.kind !== 'Call') return m;
      const def = defs.get(m.name);
      if (def === undefined) return m;
      const body = bodyOf(def);
      if (!def.params.every((p) => countUses(body, p.name) > 0)) return m;
      return substitute(body, new Map(def.params.map((p, i) => [p.name, m.args[i] as Expr])));
    };

    return {
      headers: program.headers,
      stmts: program.stmts.map((s) => (s.kind === 'Def' ? s : { ...s, body: walk(s.body) })),
    };
  }
}
```

**이조 접기**는 같은 종류의 이조가 겹친 것을 하나로 합친다. `+2d +3d`는 `+5d`이다. 종류가 다르면 접지 않는다(`+2d +3st`는 그대로). 두 가지 예외 규칙이 있다.

- 반음 이조의 합이 0이면 이조를 없앤다(`+3st -3st`).
- 온음계 이조의 합이 0이어도 없애지 않는다. `C#4 +2d -2d`는 접지 않으면 E307인데 없애면 오류가 사라지기 때문이다.

접은 노드는 첫 이조의 `opSpan`과 `firstStep`을 가진다. E307 메시지가 `(use +2st instead)`처럼 첫 이조의 양을 말하므로, 접어도 같은 메시지가 나오게 하려는 것이다.

`src/core/opt/ast/fold-transpose.ts`

```ts
import { mapChildren, type Expr, type Program } from '../../ast/ast.ts';
import type { Pass } from '../pass.ts';

/**
 * 같은 종류(d 또는 st)의 이조가 겹쳐 있으면 하나로 접는다.
 * 반음(st) 합이 0이면 이조를 없앤다. 온음계(d) 합이 0이어도 없애지 않는다.
 * 음계 밖의 음에서 E307이 나던 프로그램이 오류 없이 통과하게 되기 때문이다.
 */
export class FoldTransposePass implements Pass<Program> {
  readonly name = 'fold-transpose';
  readonly mandatory = false;

  run(program: Program): Program {
    return {
      headers: program.headers,
      stmts: program.stmts.map((s) => ({ ...s, body: this.fold(s.body) })),
    };
  }

  private fold(e: Expr): Expr {
    const m = mapChildren(e, (c) => this.fold(c));
    if (m.kind !== 'Transpose' || m.amount.kind !== 'Interval') return m;
    const inner = m.operand;
    if (inner.kind !== 'Transpose' || inner.amount.kind !== 'Interval') return m;
    if (inner.amount.unit !== m.amount.unit) return m;

    const total = inner.sign * inner.amount.size + m.sign * m.amount.size;
    if (m.amount.unit === 'st' && total === 0) return inner.operand;
    return {
      kind: 'Transpose',
      operand: inner.operand,
      sign: total < 0 ? -1 : 1,
      amount: {
        kind: 'Interval',
        size: Math.abs(total),
        unit: m.amount.unit,
        span: inner.amount.span,
      },
      opSpan: inner.opSpan,
      span: m.span,
      firstStep: inner.firstStep ?? { sign: inner.sign, size: inner.amount.size },
    };
  }
}
```

**HIR 최적화**는 두 단계이다. 붙임줄 병합(`mandatory`)은 `resolveTies`의 병합 결과를 쓴다. 쉼표 병합은 시간상 맞닿은 쉼표를 하나로 합치고 `-O0`에서는 건너뛴다.

`src/core/opt/hir/passes.ts`

```ts
import type { HirEvent, HirProgram, HirRest } from '../../eval/hir.ts';
import type { Pass } from '../pass.ts';
import { resolveTies } from '../../eval/ties.ts';

const mapTracks = (
  p: HirProgram,
  f: (events: readonly HirEvent[]) => readonly HirEvent[],
): HirProgram => ({
  ...p,
  tracks: p.tracks.map((t) => ({ ...t, events: f(t.events) })),
});

/** 이어진 음을 하나로 합친다. 출력 의미가 달라지므로 -O0에서도 실행한다. */
export class TieMergePass implements Pass<HirProgram> {
  readonly name = 'tie-merge';
  readonly mandatory = true;
  run(p: HirProgram): HirProgram {
    return mapTracks(p, (events) => resolveTies(events).merged);
  }
}

/** 시간상 맞닿은 쉼표를 하나로 합친다. */
export class RestMergePass implements Pass<HirProgram> {
  readonly name = 'rest-merge';
  readonly mandatory = false;
  run(p: HirProgram): HirProgram {
    return mapTracks(p, (events) => {
      const out: HirEvent[] = [];
      for (const ev of events) {
        const prev = out[out.length - 1];
        if (
          ev.kind === 'rest' &&
          prev?.kind === 'rest' &&
          prev.start.add(prev.dur).equals(ev.start)
        ) {
          const merged: HirRest = { ...prev, dur: prev.dur.add(ev.dur) };
          out[out.length - 1] = merged;
        } else out.push(ev);
      }
      return out;
    });
  }
}
```

### 단계 15: 최적화

최적화 절의 `Pass<T>`와 `PassPipeline`을 쓰고, 수업의 "기본 블록 안의 최적화"와 연결한다. 트랙이 분기 없는 기본 블록 하나이므로, 흐름 그래프 없이 블록 안의 지역 최적화만 필요하다.

| 수업의 최적화                       | Clef의 패스                              | 단계 |
| ----------------------------------- | ---------------------------------------- | ---- |
| 대수적 간소화, 상수 접기            | `FoldTransposePass`(`+2d +3d`를 `+5d`로) | AST  |
| 함수 호출 제거                      | `InlinePass`                             | AST  |
| peephole(인접 명령 합치기)          | `TieMergePass`(필수), `RestMergePass`    | HIR  |
| DAG를 이용한 공통 부분식 제거(선택) | 같은 구조의 하위 식을 하나의 노드로 공유 | AST  |

DAG 공통 부분식 제거는 선택 사항이다. 같은 구조의 하위 식(`m1 + 2d`가 여러 번 나올 때)을 해시로 묶어 평가를 한 번만 하게 하는 패스이다. 하위 식의 위치(`span`)를 무시하고 묶으면 오류 위치가 하나로 합쳐져 `-O0`과 진단이 달라질 수 있다. 그래서 진단이 하나도 없는 프로그램에서만 적용하는 조건을 두어야 한다. 시간이 모자라면 건너뛴다.

#### 이정표와 성질

SPEC의 5단계, 7단계 입력과 "성질 테스트"가 맞는다. `-O0`과 기본 옵션의 LIR과 진단이 같다는 성질은 `fast-check`로 확인한다.

### 낮은 수준 IR 변환

변환은 시간을 정수 틱으로 바꾸고 쉼표를 버린다. 온음표 하나가 1920틱이다(분해능 480 PPQ). 이벤트는 (틱, 채널, 음높이)순으로 정렬한다. E302가 평가 단계에서 이미 걸러졌으므로 여기서 정수가 아닌 값을 만나면 컴파일러의 버그이고 일반 `Error`로 던진다.

`src/core/lower/lowerer.ts`

```ts
import type { HirProgram } from '../eval/hir.ts';

export const PPQ = 480;
export const TICKS_PER_WHOLE = BigInt(PPQ * 4);

export interface LirEvent {
  readonly tick: number;
  readonly channel: number;
  readonly pitch: number;
  readonly dur: number;
}

export interface LirTrack {
  readonly name: string;
  readonly instrument: string;
  readonly channel: number;
  readonly events: readonly LirEvent[];
}

export interface LirProgram {
  readonly ppq: number;
  readonly tempo: number;
  readonly timeNum: number;
  readonly timeDen: number;
  readonly keyName: string;
  readonly mode: string;
  readonly tracks: readonly LirTrack[];
}

/** 유리수 시간을 정수 틱으로 바꾼다. 쉼표는 버리고, 이벤트를 (tick, channel, pitch)로 정렬한다. */
export class Lowerer {
  lower(hir: HirProgram): LirProgram {
    return {
      ppq: PPQ,
      tempo: hir.header.tempo,
      timeNum: hir.header.timeNum,
      timeDen: hir.header.timeDen,
      keyName: hir.header.keyName,
      mode: hir.header.mode,
      tracks: hir.tracks.map((t) => ({
        name: t.name,
        instrument: t.instrument,
        channel: t.channel,
        events: t.events
          .flatMap((e) =>
            e.kind === 'note'
              ? [
                  {
                    tick: this.ticks(e.start),
                    channel: t.channel,
                    pitch: e.pitch,
                    dur: this.ticks(e.dur),
                  },
                ]
              : [],
          )
          .sort((a, b) => a.tick - b.tick || a.channel - b.channel || a.pitch - b.pitch),
      })),
    };
  }

  /** E302가 평가 단계에서 이미 걸러졌으므로 여기서 정수가 아니면 컴파일러 버그다. */
  private ticks(r: { toTicks(n: bigint): bigint | null }): number {
    const t = r.toTicks(TICKS_PER_WHOLE);
    if (t === null) throw new Error('internal error: non-integer tick reached the lowerer');
    return Number(t);
  }
}

/** 골든 테스트용 출력. 한 줄에 "tick channel pitch duration". */
export function formatLir(lir: LirProgram): string {
  const lines: string[] = [];
  for (const t of lir.tracks) {
    lines.push(`track ${t.name} channel ${t.channel}`);
    for (const e of t.events) lines.push(`${e.tick} ${e.channel} ${e.pitch} ${e.dur}`);
  }
  return lines.join('\n');
}
```

### 단계 14: LIR 변환

낮은 수준 IR 변환 절의 `Lowerer`를 그대로 만든다. 1920틱이 온음표이고, 정수가 아닌 틱은 평가 단계에서 이미 E302로 걸러졌으므로 여기서는 일반 `Error`로 던진다.

수업의 3주소 코드(TAC)와 대응시키면 발표에서 설명하기 쉽다. TAC는 명령 한 줄이 연산 하나를 하고 중간 결과를 임시 변수에 담는다. LIR의 이벤트 한 줄 `tick channel pitch duration`은 연산 하나이고, 임시 변수 대신 시각이 값 역할을 한다. 분기와 반복이 없는 선형 코드라서 트랙 하나가 곧 기본 블록 하나이다. 이 점이 단계 15의 근거가 된다.

완료 기준은 SPEC의 8단계 입력 12개의 출력이 모두 맞는 것이다.

### 표준 MIDI 파일 기록

SMF 형식 1이다. 파일은 헤더 청크 하나와 트랙 청크들로 구성된다. 첫 트랙은 템포와 박자표를 담는 지휘 트랙이고, 이어서 LIR 트랙마다 하나씩 둔다.

| 항목           | 값                                                             |
| -------------- | -------------------------------------------------------------- |
| 헤더           | `MThd`, 길이 6, 형식 1, 트랙 수 = 1 + LIR 트랙 수, 분해능 480  |
| 템포 메타      | `FF 51 03` + 4분음표당 마이크로초 (`60000000 / 템포`)          |
| 박자표 메타    | `FF 58 04 분자 log2(분모) 24 8`                                |
| 악기           | 델타 0의 프로그램 체인지(`Cn 프로그램`)                        |
| 음             | 노트 온 `9n`, 노트 오프 `8n`, 벨로시티 80 고정                 |
| 같은 틱의 순서 | 노트 오프가 노트 온보다 먼저 (붙어 있는 같은 음이 겹치지 않게) |
| 트랙 끝        | `FF 2F 00`                                                     |

델타 시간은 가변 길이 수(VLQ)이다. 7비트씩 끊어 앞 바이트의 최상위 비트를 1로 둔다. 구현의 `vlq`는 이 규칙 그대로이다.

`src/core/smf/writer.ts`

```ts
import type { LirProgram, LirTrack } from '../lower/lowerer.ts';
import { Instrument } from '../music/instruments.ts';

class ByteWriter {
  private readonly bytes: number[] = [];

  u8(...v: number[]): this {
    for (const b of v) this.bytes.push(b & 0xff);
    return this;
  }
  u16(v: number): this {
    return this.u8(v >> 8, v);
  }
  u32(v: number): this {
    return this.u8(v >>> 24, v >>> 16, v >>> 8, v);
  }
  ascii(s: string): this {
    for (const ch of s) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  /** 가변 길이 수. 7비트씩 끊어 상위 비트를 이어짐 표시로 쓴다. */
  vlq(v: number): this {
    const parts = [v & 0x7f];
    for (let rest = v >>> 7; rest > 0; rest >>>= 7) parts.unshift((rest & 0x7f) | 0x80);
    return this.u8(...parts);
  }
  append(o: ByteWriter): this {
    this.bytes.push(...o.bytes);
    return this;
  }
  get length(): number {
    return this.bytes.length;
  }
  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

interface RawEvent {
  readonly tick: number;
  /** 같은 tick에서 음 끝(0)을 음 시작(1)보다 먼저 쓴다. */
  readonly order: 0 | 1;
  readonly pitch: number;
  readonly on: boolean;
}

/** LIR을 표준 MIDI 파일(형식 1)의 바이트로 바꾼다. */
export class MidiWriter {
  constructor(private readonly velocity = 80) {}

  write(lir: LirProgram): Uint8Array {
    const out = new ByteWriter();
    out
      .ascii('MThd')
      .u32(6)
      .u16(1)
      .u16(1 + lir.tracks.length)
      .u16(lir.ppq);
    out.append(this.chunk(this.tempoTrack(lir)));
    lir.tracks.forEach((t) => out.append(this.chunk(this.noteTrack(t))));
    return out.toUint8Array();
  }

  private chunk(body: ByteWriter): ByteWriter {
    return new ByteWriter().ascii('MTrk').u32(body.length).append(body);
  }

  private tempoTrack(lir: LirProgram): ByteWriter {
    const micros = Math.round(60_000_000 / lir.tempo);
    const dd = Math.log2(lir.timeDen);
    return new ByteWriter()
      .vlq(0)
      .u8(0xff, 0x51, 0x03, micros >> 16, micros >> 8, micros)
      .vlq(0)
      .u8(0xff, 0x58, 0x04, lir.timeNum, dd, 24, 8)
      .vlq(0)
      .u8(0xff, 0x2f, 0x00);
  }

  private noteTrack(t: LirTrack): ByteWriter {
    const w = new ByteWriter();
    const program = Instrument.find(t.instrument)?.program ?? 0;
    w.vlq(0).u8(0xc0 | t.channel, program);

    const raw: RawEvent[] = t.events.flatMap((e) => [
      { tick: e.tick, order: 1 as const, pitch: e.pitch, on: true },
      { tick: e.tick + e.dur, order: 0 as const, pitch: e.pitch, on: false },
    ]);
    raw.sort((a, b) => a.tick - b.tick || a.order - b.order || a.pitch - b.pitch);

    let prev = 0;
    for (const ev of raw) {
      w.vlq(ev.tick - prev);
      prev = ev.tick;
      w.u8((ev.on ? 0x90 : 0x80) | t.channel, ev.pitch, ev.on ? this.velocity : 0);
    }
    return w.vlq(0).u8(0xff, 0x2f, 0x00);
  }
}
```

`mido`로 읽어 확인한 결과는 다음과 같다. 형식 1, 분해능 480, 트랙 2개, 템포 500000(120 BPM), 박자표 4/4, 프로그램 0, 그리고 `[0 60 160]`, `[160 62 160]`, `[320 64 160]`, `[480 67 1440]` 구간에 맞는 노트 온, 오프 쌍이 나왔다.

### 단계 17: SMF 출력, 웹 시연

선택 단계이다. 표준 MIDI 파일 기록 절의 `MidiWriter`와 웹 시연 절(`CodeMirror`, `Tone.js`)을 그대로 따른다.

### 파이프라인

`Compiler`는 단계를 순서대로 부르고 오류가 있으면 그 단계 산출물까지 담아 멈춘다. 호출하는 쪽은 `CompileResult`에서 필요한 단계의 산출물을 꺼내 `emit/*`로 출력한다.

`src/core/pipeline.ts`

```ts
import type { Program } from './ast/ast.ts';
import { Checker, type CheckResult } from './check/checker.ts';
import type { SourceFile } from './common/span.ts';
import { DiagnosticBag, type CappedDiagnostics } from './diagnostics/diagnostic.ts';
import { Evaluator } from './eval/evaluator.ts';
import type { HirProgram } from './eval/hir.ts';
import { Lexer } from './lexer/lexer.ts';
import type { Token } from './lexer/token.ts';
import { Lowerer, type LirProgram } from './lower/lowerer.ts';
import { FoldTransposePass } from './opt/ast/fold-transpose.ts';
import { InlinePass } from './opt/ast/inline.ts';
import { RestMergePass, TieMergePass } from './opt/hir/passes.ts';
import { PassPipeline, type OptLevel } from './opt/pass.ts';
import type { ParseTree } from './grammar/lr-driver.ts';
import { Parser } from './parser/parser.ts';
import { MidiWriter } from './smf/writer.ts';

export interface CompileOptions {
  readonly optLevel: OptLevel;
  /** true이면 마지막에 .mid 바이트까지 만든다. */
  readonly smf: boolean;
  /** true이면 `--emit parse`를 위해 파스 트리도 만든다. */
  readonly parseTree: boolean;
}

/** 각 단계가 만든 산출물. 실패한 단계 뒤의 항목은 비어 있다. */
export interface CompileResult {
  /** 정렬하고 50개로 자른 진단. 출력하는 쪽은 `hidden`이 0보다 크면 `too many errors`를 붙인다. */
  readonly diagnostics: CappedDiagnostics;
  readonly ok: boolean;
  readonly tokens?: readonly Token[];
  readonly parseTree?: ParseTree;
  readonly ast?: Program;
  readonly checked?: CheckResult;
  readonly astOpt?: Program;
  readonly hir?: HirProgram;
  readonly hirOpt?: HirProgram;
  readonly lir?: LirProgram;
  readonly smf?: Uint8Array;
}

/** 단계를 순서대로 묶는 퍼사드. 오류가 있으면 그 단계에서 멈춘다. */
export class Compiler {
  private readonly astPasses = new PassPipeline<Program>([
    new InlinePass(),
    new FoldTransposePass(),
  ]);
  private readonly hirPasses = new PassPipeline<HirProgram>([
    new TieMergePass(),
    new RestMergePass(),
  ]);

  compile(file: SourceFile, options: CompileOptions): CompileResult {
    const bag = new DiagnosticBag();
    const done = (partial: Omit<CompileResult, 'diagnostics' | 'ok'>): CompileResult => ({
      ...partial,
      diagnostics: bag.capped(),
      ok: !bag.hasErrors(),
    });

    const tokens = new Lexer(file, bag).tokenize();
    if (bag.hasErrors()) return done({ tokens });

    const parser = new Parser(tokens, bag);
    const ast = parser.parseAst();
    // 같은 토큰을 다른 의미 동작으로 한 번 더 구동한다. 진단은 첫 구동에서 이미 모았다.
    const parseTree = options.parseTree ? parser.parseTree() : undefined;
    const base = { tokens, ...(parseTree ? { parseTree } : {}) };
    if (bag.hasErrors()) return done(base);

    const checked = new Checker(ast, bag).check();
    if (bag.hasErrors()) return done({ ...base, ast, checked });

    const astOpt = this.astPasses.run(ast, options.optLevel);
    const hir = new Evaluator(astOpt, checked.header, bag).evaluate();
    if (bag.hasErrors()) return done({ ...base, ast, checked, astOpt, hir });

    const hirOpt = this.hirPasses.run(hir, options.optLevel);
    const lir = new Lowerer().lower(hirOpt);
    const smf = options.smf ? new MidiWriter().write(lir) : undefined;
    return done({ ...base, ast, checked, astOpt, hir, hirOpt, lir, ...(smf ? { smf } : {}) });
  }
}
```

오류 전파는 이렇다. 렉서와 파서는 각각 오류가 있어도 끝까지 돌아 여러 오류를 모은다. 렉서에 오류가 있으면 파서를 돌리지 않고, 파서에 오류가 있으면 AST 이후를 만들지 않는다. 검사기에 오류가 있으면 평가하지 않는다. 평가기에 오류가 있으면 HIR 최적화와 변환을 하지 않는다. 경고는 단계를 멈추지 않는다. 스펙의 오류 전파 규칙과 다르면 스펙을 따른다.

`--emit` 단계와 `CompileResult` 필드의 대응은 다음과 같다.

| `--emit`  | 필드               | 출력기                                    |
| --------- | ------------------ | ----------------------------------------- |
| `tokens`  | `tokens`           | `emit/tokens.ts` (`formatToken`을 줄마다) |
| `parse`   | `parseTree`        | `emit/parse.ts`                           |
| `ast`     | `ast`              | `emit/ast.ts`                             |
| `typed`   | `checked.bindings` | `emit/typed.ts` (`이름 : 타입`)           |
| `ast-opt` | `astOpt`           | `emit/ast.ts`                             |
| `hir`     | `hir`              | `emit/hir.ts`                             |
| `hir-opt` | `hirOpt`           | `emit/hir.ts`                             |
| `ir`      | `lir`              | `lower/lowerer.ts`의 `formatLir`          |
| `smf`     | `smf`              | 바이트를 파일로 저장                      |

HIR 출력기는 아래와 같다. 스펙의 HIR 예시(`C4~ C4 E4:2`, `_ _ C4:2`의 병합 전과 후)와 같은 출력이 나오는 것을 확인했다.

`src/core/emit/hir.ts`

```ts
import type { HirProgram } from '../eval/hir.ts';

/** `--emit hir`와 `--emit hir-opt`의 출력. 시간은 온음표 기준 분수다. */
export function formatHir(hir: HirProgram): string {
  const lines: string[] = [];
  for (const t of hir.tracks) {
    lines.push(`track ${t.name} channel ${t.channel}`);
    for (const e of t.events) {
      lines.push(
        e.kind === 'note'
          ? `note ${e.start} ${e.dur} ${e.pitch}${e.tie ? ' tie' : ''}`
          : `rest ${e.start} ${e.dur}`,
      );
    }
  }
  return lines.join('\n');
}
```

파스 트리, AST, 타입 출력기의 정확한 문자열은 스펙의 해당 절과 골든 파일이 정한다. 이 문서는 어느 모듈이 맡는지만 정한다.

### 단계 16: 파이프라인, CLI, `--emit`

파이프라인 절의 `Compiler`와 CLI 절의 명령을 만든다. 파스에는 LALR 표를 쓴다.

| 옵션                                                               | 출력               |
| ------------------------------------------------------------------ | ------------------ |
| `--emit tokens\|parse\|ast\|typed\|ast-opt\|hir\|hir-opt\|ir\|smf` | SPEC의 단계별 출력 |

#### 이정표 4

`vp run clef examples/canon.clef --emit ir`가 단계 14의 출력을 낸다. 오류가 있는 파일은 오류가 처음 난 단계까지만 출력하고 종료 코드 1을 낸다.

## 진단 위치 규칙

진단이 가리키는 위치는 코드마다 정해져 있다. 아래 표는 스펙 테스트 명세의 줄:열과 일치함을 확인한 것이다.

| 코드        | 가리키는 곳                                       | 예                                 |
| ----------- | ------------------------------------------------- | ---------------------------------- |
| E001 ~ E003 | 문제가 된 문자나 단어의 시작                      | `m1 = C10` 은 1:6                  |
| E010        | 기대와 다른 토큰                                  | `m1 = C4 +` 은 1:10                |
| E011        | 위치가 어긋난 헤더 키워드                         | 2:1                                |
| E101        | 정의되지 않은 이름 토큰                           | `track piano = m2` 는 1:15         |
| E102        | 두 번째 헤더 키워드                               | 2:1                                |
| E103        | 다시 정의된 이름                                  | 2:1                                |
| E104        | 악기 이름                                         | `track pino = ...` 는 1:7          |
| E201        | 이항 연산자 토큰. 나열은 잘못된 항목의 시작       | `C4 + C4` 는 1:18, `C4 2d` 는 1:18 |
| E203        | 인자 개수는 호출 이름, 인자 타입은 그 인자의 시작 | 2:15                               |
| E204        | 본문 식의 시작                                    | 1:30                               |
| E301 (마디) | 닫는 마디선                                       | 1:26, 1:43                         |
| E301 (트랙) | 트랙 본문 식의 시작                               | 1:15                               |
| E302        | 묶음이면 `[`, 일반 음표면 음표                    | `m1 = [C4 ...]:1` 은 1:6           |
| E303        | 범위를 벗어난 음표                                | 1:15                               |
| E304        | 이어질 상대가 없는 음표                           | 1:15                               |
| E305        | 16번째 트랙의 악기 이름                           | 16:7                               |
| E306        | 묶음 안의 마디선                                  | 1:10                               |
| E307        | 이조 연산자(`+` 또는 `-`)                         | `C#4:4 + 2d` 는 1:21               |
| E401        | 순환을 닫는 호출 이름                             | 1:28                               |
| E402        | 반복 횟수 토큰                                    | `C4*0` 은 1:18                     |
| E403        | 한도를 넘긴 식의 시작                             | `b = a*1000` 은 2:5                |
| W601        | 정의 이름                                         | 1:1, 1:5                           |
| W602        | 파일 처음                                         | 1:1                                |
| W603        | 병렬 연산자 `&`                                   | 1:20                               |

이 표 때문에 AST 노드에 `span`과 `opSpan`이 둘 다 있다. 구현 중 위치가 어긋나면 먼저 이 표에서 어느 위치를 써야 하는지 확인한다.

메시지 문구도 스펙 테스트 명세와 일치한다. 대표 문구는 다음과 같다.

```text
E002  invalid note 'C10': the octave must be a single digit
E101  undefined name 'm2'            help: did you mean 'm1'?
E201  operator '+' is not defined for (Note, Note)
      help: expected (Note + Interval) or (Phrase + Interval)
E301  measure has length 3/4, expected 4/4 (missing 1/4)
E301  measure has length 5/4, expected 4/4 (1/4 too long)
E301  track 'piano' has length 3/4, which is not a multiple of the measure length 4/4
E302  note length 1/28 is not representable at 480 ticks per quarter note
E303  pitch C9 (120) is outside the range of piano (A0 to C8)
E304  tie from C4 has no matching note (the next note is D4)
E307  pitch C#4 is not in the C major scale (use +2st instead)
E403  expansion limit exceeded (more than 100000 events)
W603  parallel phrases have different lengths (4/4 and 2/4), the shorter one is padded with a rest
```

## 테스트 설계

### 구성

| 종류      | 위치                     | 대상                                                              | 방식                                           |
| --------- | ------------------------ | ----------------------------------------------------------------- | ---------------------------------------------- |
| 단위      | `tests/unit`             | `Rational`, `diatonicShift`, `resolveTies`, `vlq`, `formatLength` | 값 비교                                        |
| 단위      | `tests/unit/automata`    | `CharSet`, `thompson`, `subsetConstruct`                          | 교과서 예제의 상태 수, JS 정규식 오라클과 비교 |
| 단위      | `tests/unit/grammar`     | FIRST, 항목 집합, LALR 표, 구동기                                 | 단계 7의 시험 문법 6개의 상태 수와 충돌 수     |
| 골든      | `tests/golden/<단계>`    | 각 단계의 출력과 진단                                             | `.clef` 입력과 `.expected` 비교                |
| 속성      | `tests/property`         | DFA와 정규식 일치, 최적화 전후 동일성, 정렬, 길이                 | `fast-check`로 임의 프로그램 생성              |
| 끝에서 끝 | `tests/unit/smf.test.ts` | `.mid` 바이트                                                     | 헤더와 이벤트 바이트 비교                      |

### 골든 러너

진단을 출력하는 단계의 기대 파일은 `bag.capped()`의 `shown`을 `Diagnostic.format()`으로 쓰고, `hidden`이 0보다 크면 마지막 줄에 `too many errors`를 넣는다.

골든 파일은 한 쌍이다. 입력은 `이름.clef`, 기대 출력은 `이름.expected`이다. 러너는 폴더 이름(단계)에 따라 컴파일러를 해당 단계까지 돌려 출력기로 문자열을 만들고 비교한다. 오류 테스트는 `Diagnostic.format()`으로 진단을 이어 붙인 문자열이 기대 출력이다. `UPDATE_GOLDEN=1`이면 비교 대신 기대 파일을 덮어써서 첫 작성이 빠르다. 덮어쓴 뒤에는 반드시 눈으로 확인하고 스펙과 대조한다.

```ts
// tests/golden/golden.test.ts 골격
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// describe, it, expect 의 import 경로는 vp create 가 만든 샘플 테스트를 따른다.
import { Compiler, SourceFile } from '../../src/core/index.ts';
import { renderStage, type Stage } from './render.ts';

const STAGES: Stage[] = ['lexer', 'parser', 'ast', 'check', 'eval', 'opt', 'ir'];

for (const stage of STAGES) {
  const dir = join(import.meta.dirname, stage);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.clef'))) {
    it(`${stage}/${file}`, () => {
      const src = readFileSync(join(dir, file), 'utf8');
      const actual = renderStage(
        stage,
        new Compiler().compile(new SourceFile(file, src), { optLevel: 1, smf: false }),
      );
      const expectedPath = join(dir, file.replace(/\.clef$/, '.expected'));
      if (process.env.UPDATE_GOLDEN || !existsSync(expectedPath))
        writeFileSync(expectedPath, actual + '\n');
      expect(actual).toBe(readFileSync(expectedPath, 'utf8').trimEnd());
    });
  }
}
```

`renderStage`는 단계 이름에서 `CompileResult`의 필드와 출력기를 고르는 작은 함수이다. 위의 `--emit` 대응표를 그대로 옮기면 된다.

### 검증 벡터

아래 입력과 출력은 참조 구현에서 모두 일치한 값이다. 골든 파일의 첫 묶음으로 그대로 쓸 수 있다. `\n`은 줄바꿈이고 헤더는 생략하면 기본값(4/4, C 장조, 120, 단위 1/4)이다.

저수준 IR(`--emit ir`)이다.

```text
time 4/4\nkey C\n\nm1 = C4 E4 G4 E4\ntrack piano = m1 m1+2d
  track piano channel 0
  0 0 60 480 | 480 0 64 480 | 960 0 67 480 | 1440 0 64 480
  1920 0 64 480 | 2400 0 67 480 | 2880 0 71 480 | 3360 0 67 480

track piano = [C4 D4 E4]:1 G4:3
  0 0 60 160 | 160 0 62 160 | 320 0 64 160 | 480 0 67 1440

track piano = (C4 E4 G4 C5) & C3:4
  0 0 48 1920 | 0 0 60 480 | 480 0 64 480 | 960 0 67 480 | 1440 0 72 480

track piano = C4 _ E4:2          0 0 60 480 | 960 0 64 960
track piano = (C4 E4)*2          0 0 60 480 | 480 0 64 480 | 960 0 60 480 | 1440 0 64 480
track piano = C4:4 + 3st         0 0 63 1920
track piano = C4:4 - 1d          0 0 59 1920
key G\ntrack piano = B4:4 + 2d   0 0 74 1920
key A minor\ntrack piano = A4:4 + 2d   0 0 72 1920
track piano = C4~ C4 E4:2        0 0 60 960 | 960 0 64 960
track piano = _ _ C4:2           960 0 60 960
track piano = C4:4 \n track bass = C2:4
  track piano channel 0 / 0 0 60 1920 ; track bass channel 1 / 0 1 36 1920
```

최적화 전후 비교(`--emit hir`와 `--emit hir-opt`)이다.

```text
track piano = C4~ C4 E4:2
  hir:      note 0 1/4 60 tie | note 1/4 1/4 60 | note 1/2 1/2 64
  hir-opt:  note 0 1/2 60 | note 1/2 1/2 64

track piano = _ _ C4:2
  hir:      rest 0 1/4 | rest 1/4 1/4 | note 1/2 1/2 60
  hir-opt:  rest 0 1/2 | note 1/2 1/2 60
```

`-O0`과 기본 옵션이 같아야 하는 프로그램이다. LIR과 진단이 모두 같아야 한다.

```text
def twice(p: Phrase): Phrase = p p\nm1 = C4 E4\ntrack piano = twice(m1 + 2d)
m1 = C4 E4 G4 E4 / track piano = m1 + 2d + 3d
m1 = C4 E4 G4 E4 / track piano = m1 + 3st - 3st
m1 = C4 E4 G4 E4 / track piano = m1 + 2d + 3st
def up(p: Phrase): Phrase = p + 2d / m1 = ... / track piano = up(m1) + 3d
key A minor / track piano = (A4 C5 E5 A5) + 2d - 2d
track piano = C#4:4 + 2d + 3d     E307 한 번 (1:21, use +2st instead)
track piano = C#4:4 + 2d - 2d     E307 한 번
def g(p: Phrase): Phrase = p p / track piano = g(C#4:4 + 2d)   E307 한 번 (중복 제거)
```

오류 위치와 메시지의 검증 입력은 앞의 진단 위치 규칙 표와 대표 문구에 모두 들어 있다.

### 속성 테스트

`fast-check`로 작은 프로그램 생성기를 만든다. 음표(`A` 부터 `G`, 옥타브 3 ~ 5, 길이 1 ~ 4), 쉼표, 나열, `& ` 병렬, `+ Nd`, `+ Nst`, 붙임줄이 맞는 음 쌍을 조합한다. 각 프로그램에 대해 다음 성질을 확인한다.

| 성질        | 내용                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| 최적화 무관 | `-O0`과 기본 옵션의 LIR과 진단이 같다                                                              |
| 결정성      | 같은 입력을 두 번 컴파일하면 출력이 같다                                                           |
| 정렬        | 각 트랙의 LIR 이벤트가 (틱, 채널, 음높이) 오름차순이다                                             |
| 길이        | 모든 이벤트에서 `틱 + 길이`의 최댓값이 해당 트랙 길이를 틱으로 바꾼 값 이하이다                    |
| 소리 보존   | 붙임줄 병합 전 HIR에서 같은 음높이로 이어진 구간의 합집합이 LIR의 같은 음높이 구간의 합집합과 같다 |

## CLI와 시연

### CLI

사용법은 `clef <파일> [--emit 단계] [-O0] [-o 출력.mid]`이다. 동작은 다음과 같다.

- 진단은 모두 `Diagnostic.formatFull(file)`로 표준 오류에 출력한다.
- `--emit`이 있으면 해당 단계 출력을 표준 출력에 쓴다. 없으면 `-o`가 있을 때 `.mid`를 쓰고, 둘 다 없으면 진단만 출력한다.
- 종료 코드는 성공 0, 소스 오류 1, 사용법 오류 2이다.
- `-O0`은 `optLevel: 0`이다.

```ts
// src/cli/main.ts 골격
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Compiler, SourceFile } from '../core/index.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    emit: { type: 'string' },
    opt: { type: 'string', short: 'O' },
    o: { type: 'string' },
  },
});
const path = positionals[0];
if (path === undefined) {
  console.error('usage: clef <file> [--emit stage] [-O0] [-o out.mid]');
  process.exit(2);
}
const file = new SourceFile(path, readFileSync(path, 'utf8'));
const result = new Compiler().compile(file, {
  optLevel: values.opt === '0' ? 0 : 1,
  smf: values.o !== undefined,
});
const { shown, hidden } = result.diagnostics;
for (const d of shown) console.error(d.formatFull(file));
if (hidden > 0) console.error('too many errors');
// values.emit 에 따라 emit/* 출력기를 골라 console.log 한다.
if (values.o !== undefined && result.smf) writeFileSync(values.o, result.smf);
process.exit(result.ok ? 0 : 1);
```

`-O0`은 짧은 옵션 `-O`에 값 `0`이 붙은 형태로 읽힌다. `opt`를 `short: 'O'`인 문자열 옵션으로 정의하면 `parseArgs`가 `values.opt === '0'`으로 돌려준다. Node 24에서 `a.clef -O0 --emit ir -o x.mid`로 확인했다.

### 웹 시연

화면은 왼쪽에 소스 입력, 오른쪽에 단계 탭(tokens, parse, ast, typed, ast-opt, hir, hir-opt, ir)과 진단 목록으로 구성한다. 입력이 바뀔 때마다 `Compiler.compile`을 부르고 선택된 탭의 출력기 결과를 보여 준다. 진단의 줄:열은 입력창의 밑줄로 표시한다. 오류가 있는 소스를 보여 주며 단계별 출력이 어디서 멈추는지 보이면 오류 처리 점수(10점)를 설명하기 쉽다.

재생은 LIR에서 바로 한다. 틱을 초로 바꾸는 식은 `초 = 틱 / 480 * 60 / 템포`이다. 이 값으로 `Tone.js`의 `PolySynth`에 `triggerAttackRelease(주파수, 길이, 시작)`을 예약한다. 주파수는 `440 * 2^((MIDI - 69) / 12)`이다. `.mid` 다운로드 버튼은 `smf: true`로 컴파일한 바이트를 `Blob`으로 내려받게 한다.

### 시연 곡

파헬벨 카논(D장조)을 단순화한 예제이다. 저작권이 소멸한 곡이다. 같은 선율이 2마디 간격으로 겹쳐 들어오는 구조가 `_:8`(쉼표 두 마디), `_:16`, `_:24`와 이조 `- 7d`(한 옥타브 아래)로 그대로 표현된다.

`examples/canon.clef`

```clef
// 파헬벨의 카논(D장조)을 단순화한 예제.
// 베이스가 4마디짜리 진행을 반복하고, 같은 선율이 2마디 간격으로 겹쳐 들어온다.
time 4/4
key D
tempo 66

ground = D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2
theme  = F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2

track cello  = ground*3
track violin = _:8 theme theme
track flute  = _:16 theme
track piano  = _:24 (theme - 7d)
```

컴파일 결과는 4트랙이다. 첼로 24개 음, 바이올린 16개, 플루트 8개, 피아노 8개이고, 템포 66에서 약 43.6초 길이이다. 아래 표는 `--emit ir` 출력의 요약이다.

| 트랙   | 채널 | 이벤트 | 끝 틱 | 진입 시점              |
| ------ | ---- | ------ | ----- | ---------------------- |
| cello  | 0    | 24     | 23040 | 1마디                  |
| violin | 1    | 16     | 19200 | 3마디                  |
| flute  | 2    | 8      | 15360 | 5마디                  |
| piano  | 3    | 8      | 19200 | 7마디 (한 옥타브 아래) |

재생은 `.mid`를 운영체제 기본 재생기나 FluidSynth 같은 MIDI 재생기에 열면 된다. 웹 시연의 재생 버튼은 같은 LIR을 쓰므로 소리가 같아야 한다.

## 스펙과 대조할 가정

스펙이 정하지 않았거나 이 문서가 구현 편의로 정한 항목이다. 스펙을 다시 읽고 다른 규정이 있으면 스펙을 따르고 이 문서를 고친다.

| 항목                     | 이 문서의 결정                                                                                                                                                                                                                                                    | 이유                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 줄 이음                  | 없음. 한 문장은 한 줄                                                                                                                                                                                                                                             | 문장 단위 오류 복구가 단순해진다                                                                                                                                                                                                                                                                                                                                                                          |
| 이름의 가시성            | 변수는 선언 뒤에서만, 함수는 어디서든 호출                                                                                                                                                                                                                        | 변수 순환을 원천 차단하고 함수 재귀는 E401로 잡는다                                                                                                                                                                                                                                                                                                                                                       |
| 함수 본문의 전역 읽기    | 허용(호출 시점의 전역 값)                                                                                                                                                                                                                                         | 전역 변수를 본문에서 쓸 수 있어야 실용적이다                                                                                                                                                                                                                                                                                                                                                              |
| 평가 오류의 범위         | 문장 단위로 중단하고 이름을 `POISON` 처리                                                                                                                                                                                                                         | 오류 연쇄 방지                                                                                                                                                                                                                                                                                                                                                                                            |
| E307                     | 문장당 첫 오류에서 중단                                                                                                                                                                                                                                           | 접힌 이조와 같은 진단을 내려고                                                                                                                                                                                                                                                                                                                                                                            |
| `+0d` 접기               | 접지 않음                                                                                                                                                                                                                                                         | E307을 숨기지 않으려고                                                                                                                                                                                                                                                                                                                                                                                    |
| 인라이닝 조건            | 모든 매개변수가 본문에서 쓰일 때만                                                                                                                                                                                                                                | 인수의 오류가 사라지지 않게                                                                                                                                                                                                                                                                                                                                                                               |
| 길이 표기                | 박자표 분모 기준(`3/4`), 불가능하면 분수                                                                                                                                                                                                                          | 스펙 예시의 메시지가 이 형식이다                                                                                                                                                                                                                                                                                                                                                                          |
| 마디선 검사              | 나열 안에서 지역적, 꼬리 구간은 검사 안 함                                                                                                                                                                                                                        | 스펙의 "마디 검사는 지역적"                                                                                                                                                                                                                                                                                                                                                                               |
| 동일 악기 두 트랙        | 허용, 채널은 선언 순서                                                                                                                                                                                                                                            | 제한이 스펙에 없다                                                                                                                                                                                                                                                                                                                                                                                        |
| 쉼표에 붙임줄            | 문법상 쉼표는 `~`를 받지 않는다                                                                                                                                                                                                                                   | 의미가 없다                                                                                                                                                                                                                                                                                                                                                                                               |
| 박자표 분모              | 2의 거듭제곱만                                                                                                                                                                                                                                                    | SMF의 박자표 메타가 `log2`를 쓴다                                                                                                                                                                                                                                                                                                                                                                         |
| E010, E011 문구          | 참조 구현의 문구는 임시                                                                                                                                                                                                                                           | 스펙의 오류표 문구가 있으면 그것을 쓴다                                                                                                                                                                                                                                                                                                                                                                   |
| 오류 전파                | 각 단계는 끝까지 돌아 오류를 모으고, 오류가 있으면 다음 단계를 돌리지 않는다(결정 6)                                                                                                                                                                              | 스펙의 오류 전파 규칙과 대조                                                                                                                                                                                                                                                                                                                                                                              |
| 헤더 출력                | `--emit ir`와 `hir`에 헤더 줄을 넣을지는 스펙 형식을 따른다                                                                                                                                                                                                       | 참조 구현은 헤더 줄 없이 트랙만 출력한다                                                                                                                                                                                                                                                                                                                                                                  |
| 결정 1. NEWLINE 만들기   | NEWLINE은 파일 맨 앞과 다른 NEWLINE 바로 뒤에서는 만들지 않는다. 마지막 토큰이 NEWLINE이 아니면 EOF 앞에 NEWLINE을 하나 넣는다. 빈 파일은 EOF만 낸다.                                                                                                             | 문법이 빈 줄을 따로 다루지 않아도 된다. PLAN.md의 "항상 NEWLINE을 넣는다"는 빈 줄에서 NEWLINE이 연달아 나온다.                                                                                                                                                                                                                                                                                            |
| 결정 2. 호출과 나열      | 공백 없이 IDENT에 붙은 `(`도 렉서는 `LPAREN`으로 낸다. 파서가 터미널을 고를 때 `CALL_LP`로 바꿔 읽는다(`parser/terminals.ts`의 `terminalOf`).                                                                                                                     | `token.ts`는 이미 `LPAREN` 주석에 "앞에 공백이 없으면 호출"이라고 적고 `spaceBefore`를 갖고 있다. 렉서가 `CALL_LP`를 새로 내면 토큰 정의를 고쳐야 하고, 직전 토큰을 보는 문맥 검사가 렉서 후처리에 들어간다. 터미널 변환은 파서 쪽 함수 하나로 끝난다. `--emit tokens`에는 둘 다 `LPAREN`으로 나온다.                                                                                                     |
| 결정 3. 음 표기 오류     | `C10`, `C4x`, `Cx`, `Foo`처럼 A부터 G로 시작하는 단어가 음이 아니면 E002이다. `Hello`처럼 H부터 Z로 시작하는 대문자 단어와 `_a`는 E001, `2dx`는 E003이다.                                                                                                         | SPEC 규칙 1이 "A부터 G로 시작하는 단어에 식별자 문자가 붙으면 E002"라고 정한다. 이전 계획은 `Cx`와 `Foo`를 E001로 두어 SPEC과 어긋났다. 오류 규칙은 가장 낮은 우선순위의 정규식으로 둔다(단계 4).                                                                                                                                                                                                         |
| 결정 4. 헤더 순서        | "헤더는 문장보다 앞에 온다"는 문법이 아니라 `Line` 생산의 의미 동작으로 검사한다. 위반하면 E010이고 그 헤더 줄은 버린다.                                                                                                                                          | 헤더 구간과 문장 구간을 문법에서 나누고 `error` 생산을 넣으면 LALR 표에서 shift/reduce 충돌이 1개 생기는 것을 확인했다. 줄 단위 문법에서는 충돌이 없다.                                                                                                                                                                                                                                                   |
| 결정 5. E011             | 닫히지 않은 괄호(E011)는 SPEC 오류 코드표대로 파서 단계의 오류로 둔다. 파서가 마지막 NEWLINE 또는 EOF에서 구문 오류를 만났고 열린 괄호가 남아 있으면, E010 대신 가장 안쪽에서 열린 괄호의 위치에 E011을 낸다. 줄 맨 앞의 키워드로 괄호를 끊는 규칙은 두지 않는다. | SPEC 표에서 E011의 단계는 "파서"이고 위치는 "여는 괄호"이다. 이전 계획의 키워드 규칙은 SPEC 예시 하나에서 일반화한 것이라 근거가 없었다. 대가가 있다. 닫히지 않은 괄호 뒤의 줄은 모두 그 괄호 안으로 들어가므로 그 뒤 문장의 오류는 보고되지 않는다. 이는 SPEC의 "괄호 깊이가 0인 첫 NEWLINE까지" 동기화 규칙과 일치한다. 여러 괄호가 열려 있을 때 어느 것을 가리킬지는 SPEC에 없어 가장 안쪽으로 정했다. |
| 결정 6. 렉서 오류와 파서 | 렉서에 오류가 있으면 파서를 돌리지 않는다.                                                                                                                                                                                                                        | SPEC의 "오류가 처음 발생한 단계까지만 출력". `m1 = C10`에서 E002만 나와야 한다.                                                                                                                                                                                                                                                                                                                           |
| 정수 리터럴 상한         | 2^53 - 1을 넘으면 E004. `IntToken.value`는 `number`이다                                                                                                                                                                                                           | 범위를 넘는 리터럴을 오류로 하는 것은 C도 같다. 틱, 박자, 반복 횟수가 이 범위를 넘을 일이 없어서 BigInt를 쓰면 모든 소비처에 변환만 늘어난다                                                                                                                                                                                                                                                              |

## 확인하지 못한 항목

- Vite+는 이 환경에서 직접 실행해 보지 못했다. 명령, 설정 키, 테스트 import 경로는 1.7.0 문서 기준으로 적었다. 공식 README와 가이드의 내용으로 적었으므로 `vp help`와 `vp create`가 만든 샘플로 다시 확인한다.
- 린트 규칙 세부(예: `switch` 완전성 검사의 타입 인식 규칙)는 적지 않았다. 분기의 완전성은 `match(...).exhaustive()`와 반환 타입 검사로 보장되고 `vp check`의 타입 검사가 잡는다.
- 이 문서의 렉서와 파서 절, 파이프라인 코드의 수정한 부분은 타입 검사를 하지 않았다. 구현하면서 확인한다.
- 웹 시연(`Tone.js` 재생, 입력창 밑줄)과 CLI의 `--emit` 분기는 설계만 했고 실행하지 않았다.
- 파스 트리, AST, 타입 출력기의 문자열 형식은 스펙의 예시를 따르며 이 문서에서 검증하지 않았다.
- 수업이 요구하는 산출물 범위(중간 표현까지인지, 기계어에 해당하는 출력까지인지)는 교수님 확인이 필요하다. 스펙의 확인 사항에 질문으로 들어 있다.
- 이 문서의 상태 수, 충돌 수, 토큰 열은 Python 임시 구현으로 계산했다. TypeScript로 구현한 결과가 다르면 어느 쪽이 틀렸는지 확인한다. 특히 충돌 수는 (상태, 터미널) 칸 단위로 센 값이다.
- 단계 10의 오류 메시지 선택 규칙은 SPEC 예시에서 일반화한 것이다. E011이 여러 열린 괄호 중 가장 안쪽을 가리킨다는 점도 SPEC에 없어 정한 것이다. SPEC의 예시가 더 있으면 대조해야 한다.
- 단계 9의 파스 트리 출력 형식(`TrackStmt` 같은 이름, `->` 사슬)은 SPEC 예시 하나에서 읽은 규칙이다. 다른 문장 종류의 출력 형식은 SPEC에 없다.
- `error` 생산을 넣은 문법의 상태 수(97, 245)는 `Line -> ERROR NEWLINE` 한 줄을 더한 문법의 값이다.
- 수업의 모호한 문법을 우선순위 선언으로 해소하는 LR 파싱(강의 슬라이드 "LR parsing with Ambiguous Grammar")은 Clef 문법이 모호하지 않으므로 이 계획에 넣지 않았다. 표 생성기에 우선순위 선언을 추가해 `E -> E + E | E * E`를 파싱하는 확장은 시간이 남을 때 가능하다.
