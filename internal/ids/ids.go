package ids

import (
	"crypto/rand"
	"encoding/base32"
	"strings"
)

const byteLen = 20

var encoding = base32.StdEncoding.WithPadding(base32.NoPadding)

func New() string {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		panic("ids: read random bytes: " + err.Error())
	}
	return strings.ToLower(encoding.EncodeToString(b))
}
