# Terms of Service

**Last updated:** February 15, 2026

[English](TERMS_OF_SERVICE.md) | [한국어](TERMS_OF_SERVICE.ko.md)

## 1. Overview

discord-cli-bridge ("the Software") is an open-source tool that bridges Discord channels to local CLI coding agents (`codex`, `claude`) running on your machine via WSL. By using this Software, you agree to the following terms.

## 2. Acceptance of Terms

By installing, configuring, or running the Software, you acknowledge that you have read, understood, and agree to be bound by these terms. If you do not agree, do not use the Software.

## 3. Security Disclosure

The Software executes CLI tools on your local machine based on commands received via Discord. You must understand the following security characteristics before use:

### 3.1 CLI Execution Privileges

- **Claude** is executed with the `--dangerously-skip-permissions` flag, which disables all built-in permission checks. The CLI tool can perform any file system operation, network request, or code execution without confirmation.
- **Codex** applies a read-only sandbox for new sessions only. Resumed sessions may have broader access.
- Prompts from Discord are passed directly to CLI tools **without sanitization**. The Software does not validate, filter, or restrict prompt content.

### 3.2 Workspace Access

- CLI tools are executed with full read/write access to the configured workspace directory.
- The `BRIDGE_WORKSPACE_ROOT` environment variable provides an **optional** boundary. If not configured, CLI tools can be executed in **any directory** on the file system.
- Symlinks within allowed directories may point to restricted locations; path validation follows symlinks.

### 3.3 Environment Inheritance

- Spawned CLI processes inherit **all environment variables** from the parent Node.js process, including API keys, tokens, credentials, and other sensitive values that may be present in your shell environment.

### 3.4 Data Storage and Exposure

- Session data (provider, model, workspace paths, CLI session IDs) and approval records (including full prompt text) are stored in **plain text** JSON files under `state/`.
- State files are not encrypted and use default file system permissions.
- CLI output, file system paths, session IDs, and error messages are sent back to Discord and are **visible to all members** of the channel.

### 3.5 Process Isolation

- CLI tools run as child processes with the **same user privileges** as the Node.js process. There is no sandboxing, containerization, or resource limitation (CPU, memory, disk I/O) beyond the OS-level user permissions.
- A malicious or unintended prompt could cause the CLI tool to read, modify, or delete files, make network requests, or consume excessive system resources.

### 3.6 Approval Workflow

- The approval system is a **convenience feature, not a security boundary**. It is designed to coordinate usage, not to prevent malicious execution.
- Non-owner users can request execution of any prompt. Approval IDs use 4 bytes of entropy.

### 3.7 Authentication

- Owner identity is verified by a single Discord user ID string match. Security depends entirely on the integrity of your Discord account.
- There is no multi-factor authentication, audit logging, or rate limiting built into the Software.

## 4. Disclaimer of Warranties

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.

The authors and contributors make no guarantees regarding:
- The security, reliability, or availability of the Software
- The behavior of third-party CLI tools (codex, claude) executed by the Software
- The protection of data processed, stored, or transmitted by the Software
- The prevention of unauthorized access, data loss, or system damage

## 5. Limitation of Liability

IN NO EVENT SHALL THE AUTHORS, CONTRIBUTORS, OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

This includes, but is not limited to:
- Data loss or corruption resulting from CLI execution
- Unauthorized access to files, credentials, or systems
- Unintended code execution, modification, or deletion of files
- Service disruption, resource exhaustion, or system damage
- Exposure of sensitive information via Discord messages or state files

## 6. User Responsibilities

By using this Software, you agree to:

- **Secure your environment**: Run the Software with a restricted user account, set `BRIDGE_WORKSPACE_ROOT`, and limit environment variables exposed to the process.
- **Protect your Discord account**: Your Discord account controls the bot. Account compromise grants full execution access.
- **Monitor execution**: Review CLI output and monitor system resources. The Software does not limit what CLI tools can do.
- **Manage state files**: Protect `state/` and `config/` directories with appropriate file system permissions. Periodically review and clean up stored data.
- **Comply with third-party terms**: Ensure your use of Codex, Claude, and Discord complies with their respective terms of service.

## 7. Changes to Terms

These terms may be updated at any time. Continued use of the Software after changes constitutes acceptance of the revised terms. Changes will be reflected in this file with an updated date.

## 8. License

The Software is licensed under the [MIT License](LICENSE). These Terms of Service supplement but do not replace the MIT License.
