package ids

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNew(t *testing.T) {
	pattern := regexp.MustCompile(`^[a-z2-7]{32}$`)
	seen := make(map[string]struct{}, 1000)
	for range 1000 {
		id := New()
		assert.Regexp(t, pattern, id)
		seen[id] = struct{}{}
	}
	assert.Len(t, seen, 1000)
}
