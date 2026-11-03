use std::net::{IpAddr, SocketAddr};
use axum::http::HeaderMap;

#[derive(Clone, Copy)]
pub enum Proxy {
    Direct,
    Fly,
}
impl Proxy {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "direct" => Ok(Self::Direct),
            "fly" => Ok(Self::Fly),
            _ => Err(format!("unknown proxy {value}; expected direct or fly")),
        }
    }
    pub fn client(self, headers: &HeaderMap, peer: Option<SocketAddr>) -> Result<String, String> {
        match self {
            Self::Direct => Ok(peer.map(|p| p.ip().to_string()).unwrap_or_else(|| "in-process".into())),
            // Only enable on the service port behind Fly Proxy; the private network is trusted.
            Self::Fly => {
                if headers.get_all("fly-client-ip").iter().count() != 1 {
                    return Err("Fly Proxy requires exactly one Fly-Client-IP header".into());
                }
                let ip = headers["fly-client-ip"].to_str().ok()
                    .and_then(|value| value.parse::<IpAddr>().ok())
                    .ok_or("Fly Proxy supplied an invalid Fly-Client-IP header")?;
                Ok(ip.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn proxy_identity_uses_only_the_explicit_trust_mode() {
        let peer = "127.0.0.1:1234".parse().unwrap();
        for ip in ["192.0.2.1", "2001:db8::1"] {
            let mut headers = HeaderMap::new();
            headers.insert("fly-client-ip", ip.parse().unwrap());
            headers.insert("x-forwarded-for", "spoofed".parse().unwrap());
            assert_eq!(Proxy::Direct.client(&headers, Some(peer)).unwrap(), "127.0.0.1");
            assert_eq!(Proxy::Fly.client(&headers, Some(peer)).unwrap(), ip);
        }
        let mut headers = HeaderMap::new();
        assert_eq!(Proxy::Fly.client(&headers, None).unwrap_err(), "Fly Proxy requires exactly one Fly-Client-IP header");
        for value in ["garbage", "192.0.2.1, 192.0.2.2", "", "192.0.2.1:80"] {
            headers.insert("fly-client-ip", value.parse().unwrap());
            assert_eq!(Proxy::Fly.client(&headers, None).unwrap_err(), "Fly Proxy supplied an invalid Fly-Client-IP header");
        }
        headers.append("fly-client-ip", "192.0.2.2".parse().unwrap());
        assert_eq!(Proxy::Fly.client(&headers, None).unwrap_err(), "Fly Proxy requires exactly one Fly-Client-IP header");
        assert!(Proxy::parse("direct").is_ok());
        assert!(Proxy::parse("fly").is_ok());
        assert_eq!(Proxy::parse("auto").err().unwrap(), "unknown proxy auto; expected direct or fly");
    }
}
