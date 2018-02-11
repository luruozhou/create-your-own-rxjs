function noop() { };
class Observer {
    static create(observer) {
        return new Observer(observer);
    }
    constructor(observer) {
        this.unsubscribed = false;
        if (typeof observer == 'function') {
            this.nextFn = observer;
        } else if (typeof observer == 'object') {
            this.nextFn = observer.next;
            this.completeFn = observer.complete;
            this.errorFn = observer.error;
        }
    }
    next(val) {
        if (!this.unsubscribed) {
            try {
                this.nextFn && this.nextFn(val)
            } catch (e) {
                throw new Error(e)
            }
        }
    }
    complete() {
        if (!this.unsubscribed) {
            try {
                this.completeFn && this.completeFn()
            } catch (e) {
                throw new Error(e)
            } finally {
                this.unsubscribe();
            }
        }
    }
    error(err) {
        if (!this.unsubscribed) {
            try {
                this.errorFn && this.errorFn(err)
            } catch (e) {
                throw new Error(e)
            } finally {
                this.unsubscribe()
            }
        }
    }
    unsubscribe() {
        this.unsubscribed = true;
    }
}

class Subject {
    constructor() {
        this.observers = [];
        this.unsubscribed = false;
    }
    subscribe(observer) {
        let len = this.observers.length
        this.observers[len] = observer;
        return () => {
            this.observers.splice(len, 1);
        }
    }
    next(val) {
        if (!this.unsubscribed) {
            this.observers.forEach(ob => {
                ob.next(val);
            })
        }
    }
    error(err) {
        if (!this.unsubscribed) {
            this.unsubscribed = true;
            this.observers.forEach(ob => {
                ob.error(err);
            })
            this.observers.length = 0;
        }
    }
    complete() {
        if (!this.unsubscribed) {
            this.unsubscribed = true;
            this.observers.forEach(ob => {
                ob.complete();
            })
            this.observers.length = 0;
        }
    }
}

class Observable {
    static create(subscribeFn) {
        return new Observable(subscribeFn);
    }
    static of(...args) {
        return new Observable(observer => {
            args.forEach(val => {
                observer.next(val);
            })
            return noop;
        })
    }
    static interval(time) {
        return new Observable(observer => {
            let i = 0;
            let timerId = setInterval(() => {
                observer.next(i++)
            }, time)
            return () => clearInterval(timerId);
        })
    }
    static timer(time) {
        return new Observable(observer => {
            let timerId = setTimeout(() => {
                observer.next()
            }, time);
            return () => clearTimeout(timerId)
        })
    }
    static fromPromise(promise) {
        return Observable.create(observer => {
            promise
                .then(val => {
                    observer.next(val)
                })
                .catch(err => {
                    observer.error(err)
                })
            return noop;
        })
    }
    static concat(...args$) {
        let unsubscribed = false;
        let unsubscribedArr = [];
        return new Observable(observer => {
            next(0, observer);
            return () => {
                unsubscribed = true;
                unsubscribedArr.forEach(unsubcribeFn => {
                    unsubcribeFn && unsubcribeFn();
                })
            }
        })
        function next(index, observer) {
            if (unsubscribed) {
                return;
            }
            if (index >= args$.length) {
                return;
            }
            let observable$ = args$[index];
            index++;
            if (!observable$) {
                observer.next();
                next(index, observer)
            } else {
                let unsubscribed = observable$.subscribe({
                    next: val => {
                        observer.next(val);
                        next(index, observer)
                    },
                    complete: () => {
                        observer.complete();
                        next(index, observer)
                    },
                    error: () => {
                        observer.error();
                        next(index, observer)
                    }
                })
                unsubscribedArr.push(unsubscribed);
            }
        }
    }
    static combineLatest(...args$) {
        let ret = new Array(args$.length).fill(undefined);
        let unsubscribedArr = [];
        return new Observable(observer => {
            args$.forEach((o$, index) => {
                let unsubscribeFn = o$.subscribe({
                    next: val => {
                        ret[index] = val;
                        observer.next(ret);
                    }
                })
                unsubscribedArr.push(unsubcribeFn);
            })
            return () => {
                unsubscribedArr.forEach(unsubcribeFn => {
                    unsubcribeFn && unsubcribeFn();
                })
            }
        })
    }
    static forkJoin(...args$) {
        const len = args$.length;
        let ret = [];
        let i = 0;
        let unsubscribedArr = [];
        return new Observable(observer => {
            args$.forEach((o$, index) => {
                let unsubcribeFn = o$.subscribe({
                    next: val => {
                        ret[index] = val;
                        i++;
                        if (i == len) {
                            observer.next(ret);
                        }
                    },
                    error: () => {
                        observer.error();
                    }
                })
                unsubscribedArr.push(unsubcribeFn);
            })
            return () => {
                unsubscribedArr.forEach(unsubcribeFn => {
                    unsubcribeFn && unsubcribeFn();
                })
            }
        })
    }
    static fromEvent(el, eventType) {
        return new Observable(observer => {
            el.addEventListener(eventType, function cb(e) {
                observer.next(e);
            })
            return () => {
                el.removeEventListener(eventType, cb);
            }
        })
    }
    constructor(subscribeFn) {
        this.subscribeFn = subscribeFn;
    }
    subscribe(observer) {
        let ob = new Observer(observer)
        let unsubscribe = this.subscribeFn(ob);
        return () => {
            unsubscribe && unsubscribe();
            ob.unsubscribe();
        }
    }
    filter(fn) {
        return Observable.create(observer => {
            let unsubscribeFn = this.subscribe({
                next: val => {
                    if (fn && fn(val)) {
                        observer.next(val);
                    }
                }
            })
            return () => {
                unsubscribeFn && unsubscribeFn();
            }
        })
    }
    do(cb) {
        return Observable.create(observer => {
            let unsubscribeFn = this.subscribe({
                next: val => {
                    cb(val);
                    observer.next(val);
                }
            })
            return () => {
                unsubscribeFn && unsubscribeFn();
            }
        })
    }
    timer(time) {
        return new Observable(observer => {
            setTimeout(() => {
                let timerId = this.subscribe({
                    next: val => observer.next(val),
                    complete: () => observer.complete(),
                    error: () => observer.error()
                })
            }, time)
            return () => clearTimeout(timerId)
        })
    }
    map(fn) {
        return new Observable(observer => {
            let unsubcribeFn = this.subscribe({
                next: value => {
                    let val;
                    let flag;
                    try {
                        val = fn(value);
                        flag = true
                    } catch (er) {
                        flag = false;
                        observer.error(er)
                    }
                    if (flag) {
                        observer.next(val);
                    }
                }
            })
            return () => {
                unsubcribeFn && unsubcribeFn();
            }
        })
    }
    mapTo(val) {
        return new Observable(observer => {
            let unsubcribeFn = this.subscribe({
                next: value => {
                    observer.next(val);
                }
            })
            return () => {
                unsubcribeFn && unsubcribeFn();
            }
        })
    }
    switchMap(fn) {
        let prevUnsubscribe;
        return new Observable(observer => {
            let unsubcribeFn = this.subscribe({
                next: val => {
                    prevUnsubscribe && prevUnsubscribe();
                    let inner$ = fn(val);
                    if (inner$ instanceof Observable) {
                        prevUnsubscribe = inner$.subscribe({
                            next: innerVal => {
                                observer.next(innerVal);
                            },
                            error: (er) => observer.error(er),
                            complete: () => observer.complete()
                        })
                    } else {
                        observer.next(inner$);
                    }
                }
            })
            return () => {
                unsubcribeFn && unsubcribeFn();
                prevUnsubscribe && prevUnsubscribe();
            }
        })
    }
    mergeMap(fn) {
        return new Observable(observer => {
            let innerUnsubcribeFn;
            let unsubcribeFn = this.subscribe({
                next: val => {
                    let inner$ = fn(val);
                    if (inner$ instanceof Observable) {
                        innerUnsubcribeFn = inner$.subscribe({
                            next: innerVal => {
                                observer.next(innerVal);
                            },
                            error: (er) => observer.error(er),
                            complete: () => observer.complete()
                        })
                    } else {
                        observer.next(inner$);
                    }
                }
            })
            return () => {
                unsubcribeFn && unsubcribeFn();
                innerUnsubcribeFn && innerUnsubcribeFn();
            }
        })
    }
    pairwise() {
        let ret = [];
        return new Observable(observer => {
            let unsubcribeFn = this.subscribe({
                next: val => {
                    if (ret.length == 0) {
                        ret.push(val);
                    } else if (ret.length == 1) {
                        ret.push(val);
                        observer.next(ret);
                    } else {
                        ret[0] = ret[1];
                        ret[1] = val;
                        observer.next(ret);
                    }

                }
            })
            return () => {
                unsubcribeFn && unsubcribeFn();
            }
        })
    }
    take(count) {
        return new Observable(observer => {
            let newCount = count;
            let unsubcribeFn = this.subscribe({
                next: val => {
                    if (newCount > 0) {
                        newCount--;
                        observer.next(val)
                    } else {
                        observer.complete();
                    }
                },
                complete: () => observer.complete()
            })
            return () => {
                unsubcribeFn && unsubcribeFn();
            }
        })
    }
    debounce(time) {
        let previous = +Date.now();
        return new Observable(observer => {
            let unsubscribeFn = this.subscribe({
                next: val => {
                    let now = +Date.now();
                    if (now - previous > time) {
                        observer.next(val)
                    }
                    previous = now;
                }
            })
            return () => {
                unsubscribeFn && unsubscribeFn();
            }
        })
    }
    publish() {
        let currentVal, ob;
        let self = this;
        let unsubcribeFn;
        let stream$ = new Observable(observer => {
            obs.push(observer);
            return () => {
                unsubcribeFn && unsubcribeFn();
            }
        })
        let obs = stream$.obs = [];

        stream$.connect = function () {
            unsubcribeFn = self.subscribe(val => {
                currentVal = val;
                obs.forEach(ob => {
                    ob.next(val);
                })
            })
        }
        return stream$;
    }
    refCount() {
        this.connect();
        return Observable.create(observer => {
            let unsubcribeFn = this.subscribe({
                next: val => {
                    observer.next(val);
                }
            })
            return () => {
                unsubcribeFn && unsubcribeFn();
            }
        })
    }
}

const Rx = {
    Observable,
    Observer
}
let stream$ =
    Rx.Observable
        .of(1, 2, 3, 4, 5)
        .do((value) => {
            console.log('do=====', value)
        })
        .filter((value) => {
            return value % 2 === 0;
        })

stream$.subscribe((value) => {
    console.log('value', value)
})
