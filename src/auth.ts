import NextAuth from "next-auth"

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    {
      id: "casdoor",
      name: "Casdoor",
      type: "oidc",
      issuer: process.env.AUTH_CASDOOR_ISSUER?.replace(/\/$/, ""),
      clientId: process.env.AUTH_CASDOOR_ID,
      clientSecret: process.env.AUTH_CASDOOR_SECRET,
    },
  ],
})
