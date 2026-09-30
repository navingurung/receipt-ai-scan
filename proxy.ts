import { NextResponse, type NextRequest } from "next/server";

// BASIC_AUTH_USER と BASIC_AUTH_PASSWORD が設定されている場合のみ Basic 認証を有効にする
export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [givenUser, ...rest] = atob(header.slice(6)).split(":");
    if (givenUser === user && rest.join(":") === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="receipt-ai-scan"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
