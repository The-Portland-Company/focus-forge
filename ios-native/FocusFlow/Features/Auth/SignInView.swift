import SwiftUI
import AuthenticationServices
import CryptoKit

struct SignInView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @State private var currentNonce: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                VStack(spacing: 8) {
                    Text("Focus Flow")
                        .font(.largeTitle.bold())
                    Text("Native iOS task management")
                        .foregroundStyle(.secondary)
                }

                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.email, .fullName]
                    let nonce = NonceGenerator.randomNonce()
                    currentNonce = nonce
                    request.nonce = NonceGenerator.sha256(nonce)
                } onCompletion: { result in
                    handleAppleResult(result)
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 50)
                .padding(.horizontal, 24)

                if let errorMessage = sessionStore.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.footnote)
                        .padding(.horizontal, 24)
                        .multilineTextAlignment(.center)
                }

                Spacer()
            }
            .background(Color.black.ignoresSafeArea())
        }
    }

    private func handleAppleResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8) else {
                sessionStore.errorMessage = "Unable to read Apple identity token"
                return
            }

            Task {
                await sessionStore.completeAppleSignIn(identityToken: token, nonce: currentNonce)
            }

        case .failure(let error):
            let nsError = error as NSError
            print("Apple authorization failure:", nsError.domain, nsError.code, nsError.userInfo)
            if let authError = error as? ASAuthorizationError {
                switch authError.code {
                case .canceled:
                    sessionStore.errorMessage = "Apple Sign In was canceled or blocked by this simulator's Apple account settings."
                case .failed:
                    sessionStore.errorMessage = "Apple Sign In failed at the iOS authorization layer."
                case .invalidResponse:
                    sessionStore.errorMessage = "Apple Sign In returned an invalid response."
                case .notHandled:
                    sessionStore.errorMessage = "Apple Sign In request was not handled by the system."
                case .matchedExcludedCredential:
                    sessionStore.errorMessage = "Apple Sign In is unavailable for this account on this device."
                case .unknown:
                    fallthrough
                @unknown default:
                    sessionStore.errorMessage = userFacingAppleFrameworkError(from: nsError)
                }
            } else {
                sessionStore.errorMessage = userFacingAppleFrameworkError(from: nsError)
            }
        }
    }

    private func userFacingAppleFrameworkError(from error: NSError) -> String {
        let underlyingError = error.userInfo[NSUnderlyingErrorKey] as? NSError
        let underlyingCode = underlyingError?.code

        if underlyingCode == -7026 || underlyingCode == -7022 {
            return "Apple Sign In capability is not provisioned for this app ID/profile. Enable Sign In with Apple for com.theportlandcompany.focusflow and regenerate provisioning."
        }

        return "Apple Sign In failed before backend token exchange. Verify Simulator Apple ID and Apple capability provisioning."
    }
}

private enum NonceGenerator {
    static func randomNonce(length: Int = 32) -> String {
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length

        while remainingLength > 0 {
            var random: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            if status != errSecSuccess { continue }
            if random < charset.count {
                result.append(charset[Int(random)])
                remainingLength -= 1
            }
        }

        return result
    }

    static func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hashed = SHA256.hash(data: data)
        return hashed.map { String(format: "%02x", $0) }.joined()
    }
}
