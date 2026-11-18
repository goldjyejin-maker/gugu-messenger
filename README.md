# 구구메신저

선생님들끼리 메시지와 첨부파일을 주고받는 업무용 웹 메신저입니다. 전부 무료 서비스로 운영할 수 있습니다.
(카테고리(최대 3개, 이름 변경 가능)별 채널 / 1:1 대화 / 실시간 메시지 / 파일 첨부(드래그·붙여넣기) / @멘션 / 이모지 반응 / 검색 / 읽지 않음 표시 / 모바일·PWA)

> 잔디(JANDI)의 화면 구조와 기능 개념을 참고해 **처음부터 직접 작성**한 앱입니다. 잔디의 코드·이미지·상표는 사용하지 않습니다.

## 1. 바로 체험하기 (서버 없이, 데모 모드)

```bash
npm install
npm run dev
```

브라우저에서 표시된 주소를 열고 이름만 입력하면 시작됩니다. 데이터는 **그 브라우저에만** 저장됩니다.
탭을 두 개 열어 서로 다른 이름으로 들어가면 실시간 대화를 시험할 수 있습니다.

## 2. 선생님들과 함께 쓰기 (무료 서버 연결)

### 2-1. Supabase 프로젝트 만들기 (무료)
1. <https://supabase.com> 가입 → New project (Free 플랜).
2. 왼쪽 **SQL Editor** → `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**.
3. **Authentication → Providers → Email** 에서 *Confirm email* 을 끄면 선생님들이 인증 메일 없이 바로 가입할 수 있습니다.
   (끄지 않으면 가입 후 메일 인증이 필요합니다.)
4. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사합니다.

### 2-2. 환경변수 설정
```bash
copy .env.example .env      # 파일을 열어 위 두 값을 채우세요
```
`anon` 키는 공개되어도 되는 키입니다. 접근 제어는 DB의 RLS 규칙(schema.sql)이 담당합니다.
**`service_role` 키는 절대 넣지 마세요.**

### 2-3. 무료 호스팅에 배포
```bash
npm run build      # dist/ 폴더 생성
```
- **Cloudflare Pages**: GitHub 저장소 연결 → Build command `npm run build`, Output `dist`, 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록.
- 또는 **GitHub Pages / Netlify** 등 정적 호스팅 어디든 `dist/` 를 올리면 됩니다.

### 2-4. 선생님들께 안내
- 배포된 주소를 공유 → 선생님이 **가입하기**(이름·이메일·비밀번호) → 공지사항·자유게시판에 자동 참여.
- 스마트폰: 브라우저 메뉴의 **홈 화면에 추가**로 앱처럼 설치(PWA).

## 무료 플랜 한계 (미리 알아 두세요)
| 항목 | 한계 |
|---|---|
| Supabase 파일 저장 | 총 1GB, 파일당 25MB로 제한해 둠 |
| Supabase DB | 500MB |
| 비활성 프로젝트 | 7일간 접속이 없으면 일시 중지(대시보드에서 재개) |
| 푸시 알림 | 미지원(앱이 열려 있을 때 탭 제목에 안 읽은 수 표시) |

학원 규모(선생님 수십 명, 텍스트 중심)에는 충분하지만, 첨부파일이 많으면 주기적으로 정리하세요.

## 구조
```
src/types.ts            도메인 타입 + MessengerAdapter 인터페이스
src/adapters/mock.ts    로컬 목업 (localStorage + IndexedDB, 탭 간 동기화)
src/adapters/supabase.ts 실제 연동 (Auth / Postgres / Realtime / Storage)
src/adapters/index.ts   환경변수에 따라 어댑터 선택
src/components/         Login, Sidebar, Chat, RightPanel
supabase/schema.sql     테이블·RLS·RPC·스토리지 정책
```
화면은 `MessengerAdapter` 인터페이스만 사용하므로, 나중에 다른 서버(Firebase 등)로 바꿀 때는 어댑터 하나만 새로 쓰면 됩니다.

## 알려진 제한 / 다음 단계 후보
- 스레드(답글), 메시지 수정, 채널 나가기/초대, 관리자 권한은 아직 없습니다.
- 잔디와의 연동이 필요하면 잔디 커넥트의 **공식 웹훅**만 사용하세요(비공식 API는 사용하지 않음).

## 업데이트 #3 (카테고리 이름 변경 · 사진 갤러리 · 새 로고)
- 사이드바 위 **⚙ 카테고리** 버튼 → 카테고리 추가 / 이름 변경 / 삭제 창.
- 이미 운영 중인 Supabase 프로젝트는 `supabase/migrations/003_rename_category.sql` 을 SQL Editor 에서 한 번 실행하세요(이름 변경에 필요).
- 한 메시지에 올린 사진은 1장 크게 / 2·3·4장 격자 / 5장 이상은 `+N` 으로 묶어 보여 주고, 눌러서 크게 보기(좌우 넘김)가 됩니다.

## 업데이트 #4 (채팅방 중심으로 단순화)
- 왼쪽은 **채팅방 목록**(＋로 새로 만들기, ⋯ → 삭제)과 **1:1 채팅** 두 부분뿐입니다. 카테고리 화면은 숨겼습니다(서버 기능은 남아 있음).
- 메시지 아래에는 **☐ 확인** 체크박스(누른 사람 이름 표시)와 내 메시지의 **삭제**만 있습니다.
- 채팅방 삭제를 쓰려면 `supabase/migrations/004_delete_channel.sql` 을 SQL Editor 에서 한 번 실행하세요.
