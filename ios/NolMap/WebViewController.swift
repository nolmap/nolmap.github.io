import UIKit
import WebKit
import SafariServices

/// 놀맵 사이트를 앱 화면 전체에 띄우는 화면.
/// - 놀맵(nolmap.github.io) 안의 이동은 앱 안에서, 다른 사이트 링크는 사파리 창으로 열어요.
/// - 전화(tel:)·메일(mailto:)·지도 앱 링크는 아이폰 기본 앱으로 열어요.
/// - 인터넷이 끊기면 앱 자체의 "연결 없음" 화면과 다시 시도 버튼을 보여줘요.
final class WebViewController: UIViewController {

    private let homeURL = URL(string: "https://nolmap.github.io/?source=ios")!
    private let appHost = "nolmap.github.io"
    private let mint = UIColor(red: 0xF2 / 255, green: 0xFA / 255, blue: 0xE7 / 255, alpha: 1)

    private var webView: WKWebView!
    private let progress = UIProgressView(progressViewStyle: .bar)
    private let offlineView = OfflineView()
    private var progressObserver: NSKeyValueObservation?

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = mint

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "NolMapApp-iOS/1.0"

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = mint
        webView.scrollView.backgroundColor = mint
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { webView.isInspectable = true }

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        progress.translatesAutoresizingMaskIntoConstraints = false
        progress.progressTintColor = UIColor(red: 0x8F / 255, green: 0xD1 / 255, blue: 0x4F / 255, alpha: 1)
        progress.trackTintColor = .clear
        view.addSubview(progress)
        NSLayoutConstraint.activate([
            progress.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progress.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progress.heightAnchor.constraint(equalToConstant: 2)
        ])
        progressObserver = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] wv, _ in
            guard let self else { return }
            self.progress.setProgress(Float(wv.estimatedProgress), animated: true)
            self.progress.isHidden = wv.estimatedProgress >= 1
        }

        offlineView.translatesAutoresizingMaskIntoConstraints = false
        offlineView.isHidden = true
        offlineView.onRetry = { [weak self] in self?.reload() }
        view.addSubview(offlineView)
        NSLayoutConstraint.activate([
            offlineView.topAnchor.constraint(equalTo: view.topAnchor),
            offlineView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            offlineView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offlineView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        webView.load(URLRequest(url: homeURL))
    }

    private func reload() {
        offlineView.isHidden = true
        if webView.url == nil { webView.load(URLRequest(url: homeURL)) } else { webView.reload() }
    }

    private func isAppPage(_ url: URL) -> Bool {
        url.host?.lowercased() == appHost
    }

    private func openOutside(_ url: URL) {
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = UIColor(red: 0x5F / 255, green: 0xAE / 255, blue: 0x3A / 255, alpha: 1)
            present(safari, animated: true)
        } else if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
    }
}

// MARK: - 이동 처리
extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
            decisionHandler(.cancel); return
        }
        switch scheme {
        case "http", "https":
            // 놀맵 페이지나, 페이지 안에 들어가는 지도·글꼴 등(서브프레임)은 앱 안에서
            if isAppPage(url) || navigationAction.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
            } else if navigationAction.navigationType == .linkActivated {
                openOutside(url)          // 사용자가 누른 외부 링크 → 사파리 창
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        case "about", "data", "blob":
            decisionHandler(.allow)
        default:
            // tel:, mailto:, sms:, kakaomap: 등은 아이폰 앱으로
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOfflineIfNeeded(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showOfflineIfNeeded(error)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        offlineView.isHidden = true
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func showOfflineIfNeeded(_ error: Error) {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        offlineView.isHidden = false
    }
}

// MARK: - 새 창 / 알림창
extension WebViewController: WKUIDelegate {
    // target="_blank", window.open → 놀맵이면 같은 화면, 아니면 사파리 창
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isAppPage(url) { webView.load(navigationAction.request) } else { openOutside(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}

// MARK: - 인터넷 연결 없음 화면
private final class OfflineView: UIView {
    var onRetry: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(red: 0xF2 / 255, green: 0xFA / 255, blue: 0xE7 / 255, alpha: 1)

        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.contentMode = .scaleAspectFit
        logo.layer.cornerRadius = 22
        logo.clipsToBounds = true
        logo.widthAnchor.constraint(equalToConstant: 96).isActive = true
        logo.heightAnchor.constraint(equalToConstant: 96).isActive = true

        let title = UILabel()
        title.text = "인터넷에 연결되어 있지 않아요"
        title.font = .boldSystemFont(ofSize: 19)
        title.textColor = UIColor(red: 0x3A / 255, green: 0x4A / 255, blue: 0x2E / 255, alpha: 1)

        let body = UILabel()
        body.text = "와이파이나 데이터가 켜져 있는지 확인한 뒤\n다시 시도해 주세요."
        body.numberOfLines = 0
        body.textAlignment = .center
        body.font = .systemFont(ofSize: 14)
        body.textColor = UIColor(red: 0x7C / 255, green: 0x8A / 255, blue: 0x73 / 255, alpha: 1)

        var conf = UIButton.Configuration.filled()
        conf.title = "다시 시도"
        conf.cornerStyle = .capsule
        conf.baseBackgroundColor = UIColor(red: 0x8F / 255, green: 0xD1 / 255, blue: 0x4F / 255, alpha: 1)
        conf.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 26, bottom: 12, trailing: 26)
        let button = UIButton(configuration: conf)
        button.addAction(UIAction { [weak self] _ in self?.onRetry?() }, for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [logo, title, body, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.setCustomSpacing(22, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}
