/**
 * Shared Perl scripts used by SSH and K8s transports.
 */

export const HEALTH_CHECK_SCRIPT = `
use JSON;
use Lemonldap::NG::Common::Conf;
use Lemonldap::NG::Common::Session;
my %res;

# 1. Test config access
my ($cfg, $storageModule, $storageOptions);
eval {
    my $conf = Lemonldap::NG::Common::Conf->new();
    die "Failed to create Conf object" unless $conf;
    $cfg = $conf->getConf();
    die "Failed to read configuration" unless $cfg;
    $storageModule  = $cfg->{globalStorage};
    $storageOptions = $cfg->{globalStorageOptions};
    $res{config} = { status => "ok", cfgNum => $cfg->{cfgNum} };
};
if ($@) {
    (my $err = "$@") =~ s/\\s+$//;
    $res{config} = { status => "error", error => $err };
}

# 2. Test session write (create a test session)
my $testSessionId;
if ($storageModule) {
    eval {
        my $s = Lemonldap::NG::Common::Session->new({
            storageModule        => $storageModule,
            storageModuleOptions => $storageOptions,
            info => {
                _utime         => time,
                uid            => "_llng_health_check",
                _session_kind  => "SSO",
                _health_check  => 1,
            },
        });
        die $s->error if $s->error;
        $testSessionId = $s->id;
        $res{sessionWrite} = { status => "ok", testSessionId => $testSessionId };
    };
    if ($@) {
        (my $err = "$@") =~ s/\\s+$//;
        $res{sessionWrite} = { status => "error", error => $err };
    }
} else {
    $res{sessionWrite} = { status => "error", error => "No session storage configured" };
}

# 3. Test session read (read back the test session, then clean up)
if ($testSessionId) {
    eval {
        my $s = Lemonldap::NG::Common::Session->new({
            storageModule        => $storageModule,
            storageModuleOptions => $storageOptions,
            id                   => $testSessionId,
        });
        die $s->error if $s->error;
        my $uid = $s->data->{uid};
        die "Session data mismatch" unless $uid eq "_llng_health_check";
        $res{sessionRead} = { status => "ok" };
        $s->remove;
    };
    if ($@) {
        (my $err = "$@") =~ s/\\s+$//;
        $res{sessionRead} = { status => "error", error => $err };
    }
} else {
    $res{sessionRead} = { status => "error", error => "Skipped (session write failed)" };
}

print JSON::to_json(\\%res);
`;

export const FLUSH_CACHE_SCRIPT = `
use JSON;
use Lemonldap::NG::Common::Conf;
my $target = shift;
my %res;
my $lmConf = Lemonldap::NG::Common::Conf->new();

if ($target eq 'config' || $target eq 'all') {
    eval {
        my $localStorage = $lmConf->{localStorage};
        my $opts = $lmConf->{localStorageOptions} || {};
        if ($localStorage) {
            eval "require $localStorage";
            die $@ if $@;
            my $cache = $localStorage->new($opts);
            $cache->clear();
            $res{config} = { status => "ok" };
        } else {
            $res{config} = { status => "skipped", reason => "No local config cache configured" };
        }
    };
    if ($@) {
        (my $err = "$@") =~ s/\\s+$//;
        $res{config} = { status => "error", error => $err };
    }
}

if ($target eq 'sessions' || $target eq 'all') {
    eval {
        my $cfg = $lmConf->getConf();
        die "Failed to read configuration" unless $cfg;
        my $mod = $cfg->{localSessionStorage};
        my $opts = $cfg->{localSessionStorageOptions} || {};
        if ($mod) {
            eval "require $mod";
            die $@ if $@;
            my $cache = $mod->new($opts);
            $cache->clear();
            $res{sessions} = { status => "ok" };
        } else {
            $res{sessions} = { status => "skipped", reason => "No local session cache configured" };
        }
    };
    if ($@) {
        (my $err = "$@") =~ s/\\s+$//;
        $res{sessions} = { status => "error", error => $err };
    }
}

print JSON::to_json(\\%res);
`;
