# Third-Party Notices

This service dynamically links the following open-source library:

## ebics-java/ebics-java-client

- Source: https://github.com/ebics-java/ebics-java-client
- Version: 2.0.0 (pinned in `pom.xml`)
- License: GNU Lesser General Public License v2.1 (LGPL-2.1-or-later)
- License text: https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html

This sidecar consumes `ebics-java-client` as a separate Maven dependency.
We do not statically link, shade, or modify the library. Any modifications we
make to `ebics-java-client` itself are contributed back upstream under LGPL-2.1.

End users of distributions containing this sidecar may obtain the corresponding
source for `ebics-java-client` from the upstream repository linked above and
may replace it with a compatible version per the LGPL-2.1 terms.
