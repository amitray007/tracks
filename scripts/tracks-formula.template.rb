# typed: false
# frozen_string_literal: true

# Homebrew formula for the Tracks CLI and local viewer.
class Tracks < Formula
  desc "Local-first viewer and sharing tool for AI coding-agent sessions"
  homepage "https://github.com/amitray007/tracks"
  url "{{URL}}"
  sha256 "{{SHA256}}"
  license "MIT"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"tracks").write <<~SH
      #!/bin/bash
      exec "#{formula_opt_bin("node")}/node" "#{libexec}/dist/index.js" "$@"
    SH
    chmod 0555, bin/"tracks"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/tracks --version").strip
    assert_match "Tracks", shell_output("#{bin}/tracks --help")
  end
end
